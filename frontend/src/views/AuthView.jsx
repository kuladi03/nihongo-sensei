import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { GoogleLogin } from '@react-oauth/google';
import { Mail, Lock, User, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AuthView() {
  const { login, register, loginWithGoogle } = useApp();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          throw new Error('Please enter your name.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await register(email.trim(), name.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      if (!credentialResponse?.credential) {
        throw new Error('No Google credentials received.');
      }
      await loginWithGoogle(credentialResponse.credential);
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again or use email/password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center items-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-[#D94E34] font-japanese font-black text-2xl shadow-xs mb-3">
            先生
          </div>
          <h1 className="font-japanese font-extrabold text-2xl text-stone-900 tracking-tight">
            日本語先生
          </h1>
          <p className="text-stone-600 text-xs mt-1 max-w-xs mx-auto">
            Multimodal Japanese learning with native audio, phonetic traps, and SM-2 spaced repetition.
          </p>
        </div>

        {/* Main Bento Auth Card */}
        <div className="bg-white border border-[#E5E0D8] rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 bg-[#F5F3EF] rounded-xl border border-[#E5E0D8] mb-6">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError('');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                !isRegister
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Sign In (ログイン)
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError('');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                isRegister
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Create Account (新規登録)
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-[#FDF2EF] border border-[#F5C6BC] text-[#9A2E1A] text-xs font-medium">
              <AlertCircle size={16} className="text-[#D94E34] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Full Name / お名前
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kenji Tanaka"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E] focus:bg-white transition-all placeholder:text-stone-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Email / メールアドレス
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E] focus:bg-white transition-all placeholder:text-stone-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Password / パスワード
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E] focus:bg-white transition-all placeholder:text-stone-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] ${
                loading
                  ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                  : 'bg-[#2B4C7E] hover:bg-[#1E3A63]'
              }`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E5E0D8]" />
            </div>
            <div className="relative inline-block px-3 bg-white text-[11px] font-bold uppercase tracking-wider text-stone-400">
              or continue with
            </div>
          </div>

          {/* Google Sign In */}
          <div className="flex justify-center w-full">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-in was unsuccessful. Please try again.')}
              shape="rectangular"
              theme="outline"
              size="large"
              width="100%"
            />
          </div>

          {/* Quick info note */}
          <div className="mt-6 pt-4 border-t border-[#E5E0D8] flex items-center gap-2 text-[11px] text-stone-500">
            <ShieldCheck size={14} className="text-[#4A7C59] shrink-0" />
            <span>
              Role-based access: First registered account automatically becomes Sensei Admin.
            </span>
          </div>
        </div>

        {/* Footer Toggle */}
        <div className="text-center mt-6 text-xs text-stone-500">
          {isRegister ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError('');
                }}
                className="font-bold text-[#2B4C7E] hover:underline"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError('');
                }}
                className="font-bold text-[#2B4C7E] hover:underline"
              >
                Create one now
              </button>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
