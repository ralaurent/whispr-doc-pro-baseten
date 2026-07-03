'use client'

import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Sparkles,
  Globe,
  MapPin,
  ShieldCheck,
  Zap,
  Upload,
  Mic,
  CheckCircle,
  UserRound
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signInAsGuest } from '@/lib/guest-session'

export default function LandingPage() {
  const router = useRouter()

  const handleGuestLogin = () => {
    signInAsGuest()
    router.push('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fcf8ff] text-[#1b1b23] font-sans overflow-x-hidden selection:bg-[#c0c1ff] selection:text-[#07006c]"
      suppressHydrationWarning>

      {/* Top Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 bg-[#fcf8ff]/80 backdrop-blur-xl border-b border-white/40 shadow-sm">
        <div className="grid grid-cols-3 items-center h-16 px-6 max-w-7xl mx-auto">
          {/* Logo */}
          <div className="text-[24px] leading-[32px] font-bold text-[#4648d4]">
            WhisprDoc
          </div>

          {/* Centered Links */}
          <div className="hidden md:flex justify-center space-x-6">
            <Link href="#features" className="text-[14px] leading-[20px] text-[#464554] font-medium hover:text-[#4648d4] transition-colors duration-200">Features</Link>
            <Link href="#pricing" className="text-[14px] leading-[20px] text-[#464554] font-medium hover:text-[#4648d4] transition-colors duration-200">Pricing</Link>
            <Link href="#languages" className="text-[14px] leading-[20px] text-[#464554] font-medium hover:text-[#4648d4] transition-colors duration-200">Languages</Link>
            <Link href="/auth/login" className="text-[14px] leading-[20px] text-[#464554] font-medium hover:text-[#4648d4] transition-colors duration-200">Login</Link>
          </div>

          {/* Right Action */}
          <div className="flex justify-end">
            <Link href="/auth/sign-up">
              <button className="bg-[#6063ee] text-[#fffbff] px-4 py-2 rounded-lg text-[14px] leading-[16px] font-semibold hover:bg-[#4648d4] active:scale-95 transition-all duration-150 shadow-sm">
                Get Started Free
              </button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero Section */}
        {/* Hero Section */}
        <section className="relative px-6 max-w-7xl mx-auto py-16 flex flex-col items-center justify-center text-center min-h-[70vh]">
          {/* Background Decorative Shader */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#4648d4]/10 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="z-10 flex flex-col items-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-[#d5e3fc] text-[#57657a] px-4 py-1 rounded-full mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-[12px] leading-[14px] font-medium">Now with 28+ Language Support</span>
            </div>

            <h1 className="text-[40px] leading-[48px] tracking-[-0.02em] font-bold text-[#1b1b23] mb-6 sm:text-[48px] sm:leading-[56px] lg:text-[64px] lg:leading-[72px]">
              Fill in documents at the <span className="text-[#4648d4] italic">speed of speech</span>
            </h1>

            <p className="text-[18px] leading-[28px] text-[#464554] mb-10 max-w-2xl mx-auto">
              Speed up document completion 10x with the world's most precise voice-to-text PDF filler. Multilingual, secure, and built for professionals.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center w-full">
              <Link href="/auth/sign-up" className="inline-block">
                <button className="w-full sm:w-auto bg-[#4648d4] hover:bg-[#6063ee] text-white px-10 py-4 rounded-xl text-[16px] font-semibold shadow-lg shadow-[#4648d4]/20 transition-all flex items-center justify-center space-x-4">
                  <span>Start Filling for Free</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
              <button
                type="button"
                onClick={handleGuestLogin}
                className="w-full sm:w-auto border border-[#c7c4d7] hover:bg-[#f5f2fe] text-[#1b1b23] px-10 py-4 rounded-xl text-[16px] font-semibold transition-all flex items-center justify-center gap-2"
              >
                <UserRound className="w-5 h-5" />
                Sign in as Guest
              </button>
            </div>
          </div>
        </section>

        {/* Speed Metric Section */}
        <section className="bg-[#ffffff] py-16 border-y border-[#f5f2fe]">
          <div className="px-6 max-w-7xl mx-auto text-center">
            <p className="text-[14px] leading-[16px] font-semibold text-[#4648d4] tracking-widest uppercase mb-2">The Whispr Advantage</p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              <div className="flex flex-col items-center">
                <span className="text-[120px] font-black text-[#4648d4] leading-none tracking-tighter">10X</span>
                <span className="text-[24px] leading-[32px] font-bold text-[#464554] -mt-2">FASTER</span>
              </div>
              <div className="h-24 w-px bg-[#c7c4d7] hidden md:block"></div>
              <div className="max-w-md text-left">
                <h2 className="text-[32px] leading-[40px] tracking-[-0.02em] font-bold text-[#1b1b23] mb-2">Why waste time typing?</h2>
                <p className="text-[16px] leading-[24px] text-[#464554]">
                  Traditional data entry averages 40 words per minute. With WhisprDoc, professionals reach speeds of 400+ words per minute with instant field mapping.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section className="px-6 max-w-7xl mx-auto py-24">
          <div className="text-center mb-16">
            <h2 className="text-[32px] leading-[40px] tracking-[-0.02em] font-bold text-[#1b1b23]">Supercharged Productivity</h2>
            <p className="text-[18px] leading-[28px] text-[#464554] mt-2">Everything you need to handle complex documents with ease.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Large Feature */}
            <div className="md:col-span-2 bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_4px_24px_-1px_rgba(71,85,105,0.08)] p-10 rounded-3xl group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Globe className="w-[160px] h-[160px]" />
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className="w-12 h-12 bg-[#c0c1ff]/30 rounded-xl flex items-center justify-center mb-4 text-[#4648d4]">
                    <Globe className="w-6 h-6" />
                  </div>
                  <h3 className="text-[24px] leading-[32px] font-bold mb-4 text-[#1b1b23]">Global Multilingual Support</h3>
                  <p className="text-[16px] leading-[24px] text-[#464554] max-w-md">
                    Our AI recognizes and translates over 50 languages in real-time. Whether you're filling out a form in Spanish, Mandarin, or German, WhisprDoc adapts instantly to your voice.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-10">
                  <span className="px-4 py-1 bg-[#e9e6f3] rounded-full text-[12px] font-medium text-[#464554]">English</span>
                  <span className="px-4 py-1 bg-[#e9e6f3] rounded-full text-[12px] font-medium text-[#464554]">Español</span>
                  <span className="px-4 py-1 bg-[#e9e6f3] rounded-full text-[12px] font-medium text-[#464554]">Français</span>
                  <span className="px-4 py-1 bg-[#e9e6f3] rounded-full text-[12px] font-medium text-[#464554]">Deutsch</span>
                  <span className="px-4 py-1 bg-[#e9e6f3] rounded-full text-[12px] font-medium text-[#4648d4] bg-[#c0c1ff]/20">+46 more</span>
                </div>
              </div>
            </div>

            {/* Small Feature 1 */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_4px_24px_-1px_rgba(71,85,105,0.08)] p-10 rounded-3xl flex flex-col">
              <div className="w-12 h-12 bg-[#d5e3fc] rounded-xl flex items-center justify-center mb-4 text-[#515f74]">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="text-[24px] leading-[32px] font-bold mb-4 text-[#1b1b23]">Intelligent Field Mapping</h3>
              <p className="text-[16px] leading-[24px] text-[#464554]">
                Don't click, just speak. Our AI automatically detects PDF fields and places your data in the correct box based on context.
              </p>
            </div>

            {/* Small Feature 2 */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_4px_24px_-1px_rgba(71,85,105,0.08)] p-10 rounded-3xl flex flex-col md:col-span-1">
              <div className="w-12 h-12 bg-[#ffdad6] rounded-xl flex items-center justify-center mb-4 text-[#ba1a1a]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-[24px] leading-[32px] font-bold mb-4 text-[#1b1b23]">Bank-Level Security</h3>
              <p className="text-[16px] leading-[24px] text-[#464554]">
                HIPAA and GDPR compliant. Your audio is processed in a secure sandbox and never stored longer than necessary for the transcription.
              </p>
            </div>

            {/* Animated Speed Metric Visual */}
            <div className="md:col-span-2 bg-[#f5f2fe] border border-white/40 shadow-[0_4px_24px_-1px_rgba(71,85,105,0.05)] rounded-3xl overflow-hidden relative">
              <div className="absolute inset-0 flex flex-col justify-center p-10 z-10">
                <h3 className="text-[24px] leading-[32px] font-bold text-[#1b1b23]">Optimized for Speed</h3>
                <p className="text-[16px] leading-[24px] text-[#464554] max-w-sm mt-2">
                  Proprietary low-latency processing ensures your text appears as you speak, with zero lag.
                </p>
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-center opacity-10 pointer-events-none">
                <Zap className="w-[200px] h-[200px] text-[#4648d4]" />
              </div>
            </div>

          </div>
        </section>

        {/* How It Works */}
        <section className="bg-[#efecf8] py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-[32px] leading-[40px] tracking-[-0.02em] font-bold text-[#1b1b23]">Three steps to freedom</h2>
              <p className="text-[18px] leading-[28px] text-[#464554] mt-2">Go from blank form to finished document in seconds.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">

              {/* Step 1 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-20 h-20 rounded-2xl bg-[#4648d4] text-white flex items-center justify-center mb-6 shadow-xl shadow-[#4648d4]/20 group-hover:-translate-y-2 transition-transform duration-300">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-[24px] leading-[32px] font-bold mb-2 text-[#1b1b23]">1. Upload</h4>
                <p className="text-[16px] leading-[24px] text-[#464554] px-4">
                  Drag and drop any PDF form or clinical document into the workspace.
                </p>
                <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-[#c7c4d7] translate-x-10 -z-10"></div>
              </div>

              {/* Step 2 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-20 h-20 rounded-2xl bg-[#4648d4] text-white flex items-center justify-center mb-6 shadow-xl shadow-[#4648d4]/20 group-hover:-translate-y-2 transition-transform duration-300">
                  <Mic className="w-8 h-8" />
                </div>
                <h4 className="text-[24px] leading-[32px] font-bold mb-2 text-[#1b1b23]">2. Speak</h4>
                <p className="text-[16px] leading-[24px] text-[#464554] px-4">
                  Narrate your findings or data. Watch as fields fill in automatically.
                </p>
                <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-[#c7c4d7] translate-x-10 -z-10"></div>
              </div>

              {/* Step 3 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-20 h-20 rounded-2xl bg-[#4648d4] text-white flex items-center justify-center mb-6 shadow-xl shadow-[#4648d4]/20 group-hover:-translate-y-2 transition-transform duration-300">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h4 className="text-[24px] leading-[32px] font-bold mb-2 text-[#1b1b23]">3. Done</h4>
                <p className="text-[16px] leading-[24px] text-[#464554] px-4">
                  Review, sign, and export. You're finished in record time.
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-[#4648d4] p-10 md:p-16 rounded-[40px] relative overflow-hidden flex flex-col md:flex-row items-center justify-between shadow-2xl shadow-[#4648d4]/20">
              <div className="absolute inset-0 bg-gradient-to-br from-[#6063ee]/50 to-transparent"></div>

              <div className="relative z-10 mb-10 md:mb-0 md:max-w-xl text-center md:text-left">
                <h2 className="text-[40px] leading-[48px] tracking-[-0.02em] font-bold text-white mb-4">
                  Ready to save hours on paperwork?
                </h2>
                <p className="text-[#e1e0ff] text-[18px] leading-[28px]">
                  Join 10,000+ professionals who have reclaimed their time with WhisprDoc. Start your 14-day free trial today.
                </p>
              </div>

              <div className="relative z-10 w-full max-w-sm">
                <form
                  onSubmit={(e) => e.preventDefault()}
                  className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl flex flex-col space-y-4 shadow-xl"
                >
                  <input
                    className="w-full bg-white/10 border border-white/20 text-white placeholder:text-white/60 rounded-xl focus:ring-2 focus:ring-white/50 focus:border-white/50 py-4 px-4 outline-none transition-all"
                    placeholder="Work email address"
                    type="email"
                    required
                  />
                  <Link href="/auth/sign-up" className="w-full">
                    <button className="w-full bg-white text-[#4648d4] text-[16px] font-bold py-4 rounded-xl hover:bg-[#f5f2fe] transition-colors shadow-sm" type="button">
                      Get Started Now
                    </button>
                  </Link>
                  <p className="text-[12px] leading-[14px] text-white/70 text-center font-medium">
                    No credit card required. Cancel anytime.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-10 bg-[#ffffff] border-t border-[#e4e1ed]">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 max-w-7xl mx-auto space-y-4 md:space-y-0">
          <div className="flex flex-col items-center md:items-start">
            <div className="text-[24px] leading-[32px] font-bold text-[#4648d4] mb-1">WhisprDoc</div>
            <p className="text-[14px] leading-[20px] text-[#464554]">© 2024 WhisprDoc AI. Precision in every syllable.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="#features" className="text-[14px] leading-[20px] text-[#464554] hover:text-[#4648d4] transition-all duration-200">Features</Link>
            <Link href="#pricing" className="text-[14px] leading-[20px] text-[#464554] hover:text-[#4648d4] transition-all duration-200">Pricing</Link>
            <Link href="#security" className="text-[14px] leading-[20px] text-[#464554] hover:text-[#4648d4] transition-all duration-200">Security</Link>
            <Link href="#terms" className="text-[14px] leading-[20px] text-[#464554] hover:text-[#4648d4] transition-all duration-200">Terms</Link>
            <Link href="#privacy" className="text-[14px] leading-[20px] text-[#464554] hover:text-[#4648d4] transition-all duration-200">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
