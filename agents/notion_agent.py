import os
import sys
import json
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List

# Lightweight fallback for load_dotenv if python-dotenv is not installed
def ensure_env_loaded():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        if env_file.exists():
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())

ensure_env_loaded()

# Import database helper if available
try:
    from db.database import save_notion_sync, init_database, get_notion_sync
except ImportError:
    sys.path.append(str(Path(__file__).resolve().parent.parent))
    from db.database import save_notion_sync, init_database, get_notion_sync

# Try importing notion_client; fallback to direct HTTPS API via urllib/requests
HAS_NOTION_CLIENT = False
try:
    from notion_client import Client as NotionClient
    HAS_NOTION_CLIENT = True
except ImportError:
    pass

import urllib.request
import urllib.parse
import urllib.error

HAS_REQUESTS = False
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    pass

class NotionSyncAgent:
    """Agent 1: Pulls and cleans syllabus notes from Notion pages."""

    NOTION_API_VERSION = "2022-06-28"
    BASE_URL = "https://api.notion.com/v1"

    def __init__(self, token: str):
        self.token = token.strip()
        self.client = None
        if HAS_NOTION_CLIENT:
            self.client = NotionClient(auth=self.token)

    def _http_get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        """HTTPS request to Notion API using requests or standard urllib."""
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": self.NOTION_API_VERSION,
            "Content-Type": "application/json",
        }
        if HAS_REQUESTS:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            if resp.status_code >= 400:
                raise RuntimeError(f"Notion API error ({resp.status_code}): {resp.text}")
            return resp.json()

        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"Notion API error ({e.code}): {err_body}")

    def get_page_metadata(self, page_id: str) -> dict:
        clean_page_id = page_id.replace("-", "")
        if self.client:
            page = self.client.pages.retrieve(page_id=clean_page_id)
        else:
            page = self._http_get(f"pages/{clean_page_id}")

        title = "Untitled Class"
        for prop in page.get("properties", {}).values():
            if prop.get("type") == "title":
                title_parts = prop.get("title", [])
                if title_parts:
                    title = "".join(t.get("plain_text", "") for t in title_parts)
                break
        return {
            "page_id": clean_page_id,
            "title": title,
            "last_edited_time": page.get("last_edited_time"),
        }

    def fetch_clean_notes(self, block_id: str, depth: int = 0) -> str:
        clean_block_id = block_id.replace("-", "")
        lines = []
        cursor = None

        while True:
            if self.client:
                res = self.client.blocks.children.list(block_id=clean_block_id, start_cursor=cursor)
            else:
                params = {"page_size": 100}
                if cursor:
                    params["start_cursor"] = cursor
                res = self._http_get(f"blocks/{clean_block_id}/children", params=params)

            for block in res.get("results", []):
                b_type = block.get("type")
                indent = "  " * depth

                if b_type == "table":
                    lines.append(self._parse_table(block["id"]))
                elif b_type == "to_do":
                    checked = "x" if block["to_do"].get("checked") else " "
                    text = self._extract_text(block["to_do"].get("rich_text", []))
                    lines.append(f"{indent}- [{checked}] {text}")
                elif b_type in ("bulleted_list_item", "numbered_list_item"):
                    prefix = "- " if b_type == "bulleted_list_item" else "1. "
                    text = self._extract_text(block[b_type].get("rich_text", []))
                    lines.append(f"{indent}{prefix}{text}")
                elif b_type in ("heading_1", "heading_2", "heading_3"):
                    level = int(b_type[-1])
                    prefix = "#" * level
                    text = self._extract_text(block[b_type].get("rich_text", []))
                    lines.append(f"\n{prefix} {text}")
                elif b_type == "callout":
                    icon = block["callout"].get("icon", {}).get("emoji", "💡")
                    text = self._extract_text(block["callout"].get("rich_text", []))
                    lines.append(f"{indent}> {icon} {text}")
                elif b_type == "quote":
                    text = self._extract_text(block["quote"].get("rich_text", []))
                    lines.append(f"{indent}> {text}")
                elif b_type == "divider":
                    lines.append(f"\n---\n")
                elif b_type == "code":
                    lang = block["code"].get("language", "")
                    code_text = self._extract_text(block["code"].get("rich_text", []))
                    lines.append(f"```{lang}\n{code_text}\n```")
                else:
                    rich_text = block.get(b_type, {}).get("rich_text", [])
                    text = self._extract_text(rich_text)
                    if text:
                        lines.append(f"{indent}{text}")

                # Traverse children recursively if present
                if block.get("has_children") and b_type != "table":
                    child_notes = self.fetch_clean_notes(block["id"], depth + 1)
                    if child_notes:
                        lines.append(child_notes)

            if not res.get("has_more"):
                break
            cursor = res.get("next_cursor")

        return "\n".join(filter(None, lines))

    def _parse_table(self, table_id: str) -> str:
        clean_table_id = table_id.replace("-", "")
        if self.client:
            rows = self.client.blocks.children.list(block_id=clean_table_id)["results"]
        else:
            rows = self._http_get(f"blocks/{clean_table_id}/children", params={"page_size": 100})["results"]

        formatted_rows = []
        for idx, row in enumerate(rows):
            cells = row.get("table_row", {}).get("cells", [])
            vals = [self._extract_text(cell).replace("\n", " ").strip() for cell in cells]
            formatted_rows.append("| " + " | ".join(vals) + " |")
            if idx == 0:
                formatted_rows.append("| " + " | ".join(["---"] * len(vals)) + " |")
        return "\n" + "\n".join(formatted_rows) + "\n"

    @staticmethod
    def _extract_text(rich_text: list) -> str:
        return "".join(t.get("plain_text", "") for t in rich_text).strip()

    @staticmethod
    def compute_hash(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def get_child_pages(self, hub_page_id: str) -> List[Dict[str, str]]:
        """Returns all child pages inside a hub directory page."""
        clean_id = hub_page_id.replace("-", "")
        child_pages = []
        cursor = None
        while True:
            if self.client:
                res = self.client.blocks.children.list(block_id=clean_id, start_cursor=cursor)
            else:
                params = {"page_size": 100}
                if cursor:
                    params["start_cursor"] = cursor
                res = self._http_get(f"blocks/{clean_id}/children", params=params)

            for block in res.get("results", []):
                if block.get("type") == "child_page":
                    p_id = block["id"].replace("-", "")
                    title = block.get("child_page", {}).get("title", "Untitled Class")
                    child_pages.append({"page_id": p_id, "title": title})

            if not res.get("has_more"):
                break
            cursor = res.get("next_cursor")
        return child_pages

    def sync_to_db(self, page_id: str) -> dict:
        """Syncs an individual page from Notion and saves directly to SQLite."""
        meta = self.get_page_metadata(page_id)
        notes = self.fetch_clean_notes(page_id)
        content_hash = self.compute_hash(notes)
        save_notion_sync(
            page_id=meta["page_id"],
            title=meta["title"],
            content_hash=content_hash,
            raw_markdown=notes,
            last_edited=meta.get("last_edited_time"),
        )
        return {
            "page_id": meta["page_id"],
            "title": meta["title"],
            "content_hash": content_hash,
            "notes_length": len(notes),
            "markdown": notes,
        }

    def sync_hub(self, hub_page_id: str) -> Dict[str, Any]:
        """Discovers and syncs all child class pages under the hub page."""
        hub_meta = self.get_page_metadata(hub_page_id)
        child_pages = self.get_child_pages(hub_page_id)

        results = []
        for child in child_pages:
            child_id = child["page_id"]
            existing = get_notion_sync(child_id)
            sync_res = self.sync_to_db(child_id)

            status = "new"
            if existing:
                if existing.get("content_hash") == sync_res["content_hash"]:
                    status = "unchanged"
                else:
                    status = "updated"

            results.append({
                "page_id": child_id,
                "title": sync_res["title"],
                "status": status,
                "content_hash": sync_res["content_hash"],
                "notes_length": sync_res["notes_length"],
            })

        return {
            "hub_id": hub_meta["page_id"],
            "hub_title": hub_meta["title"],
            "total_classes": len(results),
            "classes": results,
        }

if __name__ == "__main__":
    init_database()
    token = os.environ.get("NOTION_TOKEN", "").strip()
    page_id = os.environ.get("NOTION_PAGE_ID", "").strip()

    if not token or "your_notion_internal" in token:
        print("\n" + "=" * 60)
        print("⚠️  ACTION REQUIRED: NOTION_TOKEN is not configured yet!")
        print("=" * 60)
        print("1. Go to: https://www.notion.so/my-integrations")
        print("2. Create a new Internal Integration (e.g. 'Nihongo Sensei')")
        print("3. Copy the 'Internal Integration Secret'")
        print("4. Paste it into your .env file:")
        print("   NOTION_TOKEN=secret_your_copied_secret_here")
        print("5. Open your Notion page (Japanese Class Notes)")
        print("   Click ••• (top-right) -> Connections -> Connect 'Nihongo Sensei'")
        print("=" * 60 + "\n")
        sys.exit(1)

    print(f"Connecting to Notion (Target ID: {page_id})...")
    try:
        agent = NotionSyncAgent(token)
        # Check if the target is a hub containing child pages
        children = agent.get_child_pages(page_id)
        if children:
            print(f"📚 Detected Hub Page: Found {len(children)} class note pages inside!\n")
            hub_result = agent.sync_hub(page_id)
            print(f"✅ Hub Sync Completed for: {hub_result['hub_title']}")
            print("=" * 60)
            for c in hub_result["classes"]:
                status_icon = "🆕" if c["status"] == "new" else ("🔄" if c["status"] == "updated" else "✨")
                print(f" {status_icon} [{c['status'].upper()}] {c['title']}")
                print(f"    Page ID: {c['page_id']} | Hash: {c['content_hash'][:16]}... | Length: {c['notes_length']} chars")
            print("=" * 60)
            print(f"All {hub_result['total_classes']} classes saved to SQLite (db/nihongo.db)!")
        else:
            result = agent.sync_to_db(page_id)
            print(f"\n✅ Synced single class page to SQLite (db/nihongo.db)!")
            print(f"=== Title: {result['title']} ===")
            print(f"=== Hash:  {result['content_hash'][:16]}... ===")
            print(f"=== Length: {result['notes_length']} characters ===\n")
            print("--- Notes Preview ---")
            print(result["markdown"][:1500])
    except Exception as e:
        print(f"\n❌ Error syncing with Notion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
