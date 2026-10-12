import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Calendar,
  CheckCircle2,
  Mail,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  Menu,
  X,
  Compass,
  BarChart3,
  Sun,
  Moon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/ui/button';

export function LandingPage() {
  const { currentUser, isEmailVerified } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAuthenticated = Boolean(currentUser && (currentUser.emailVerified || isEmailVerified));

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col selection:bg-blue-500 selection:text-white transition-colors duration-200">
      {/* ---------------- NAVIGATION ---------------- */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">UniFlow</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60">
                v1.0
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-300">
            <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              How It Works
            </a>
            <a href="#timetable-sync" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Timetable Sync
            </a>
            <a href="#attendance" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Attendance Math
            </a>
          </nav>

          {/* Action Buttons & Theme Toggle */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')} className="shadow-md shadow-blue-500/20 font-semibold">
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" className="font-semibold text-gray-700 dark:text-gray-200">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button className="shadow-md shadow-blue-500/20 font-semibold">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="sm:hidden border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-4 space-y-3"
            >
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                How It Works
              </a>
              <a
                href="#timetable-sync"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Timetable Sync
              </a>
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                {isAuthenticated ? (
                  <Button onClick={() => navigate('/dashboard')} className="w-full justify-center">
                    Dashboard
                  </Button>
                ) : (
                  <>
                    <Link to="/login" className="w-full">
                      <Button variant="outline" className="w-full justify-center">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/register" className="w-full">
                      <Button className="w-full justify-center">Get Started Free</Button>
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ---------------- HERO SECTION ---------------- */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(59,130,246,0.15),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(59,130,246,0.25),rgba(0,0,0,0))]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-900/80 mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>The Smart College Timetable & Attendance Platform</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white max-w-4xl mx-auto leading-tight">
            Your College Life,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
              In Sync.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Never lose track of updated schedules or get debarred. UniFlow synchronizes weekly timetable revisions, calculates attendance recovery math, and finds your free study slots.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {isAuthenticated ? (
              <Button
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="w-full sm:w-auto text-base font-semibold px-8 py-3.5 shadow-xl shadow-blue-500/25"
              >
                Open Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            ) : (
              <>
                <Link to="/register" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto text-base font-semibold px-8 py-3.5 shadow-xl shadow-blue-500/25 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Get Started Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/login" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto text-base font-semibold px-8 py-3.5 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Highlights checklist */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Offline Progressive Web App (PWA)
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Gmail Timetable PDF Sync
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              100% Free Tier Compliant
            </span>
          </div>

          {/* ---------------- LIVE PREVIEW CARD MOCKUP ---------------- */}
          <div className="mt-14 max-w-4xl mx-auto rounded-3xl p-2 sm:p-4 bg-gradient-to-b from-blue-100/50 to-indigo-100/30 dark:from-gray-800/50 dark:to-gray-900/30 border border-blue-200/50 dark:border-gray-800 shadow-2xl">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 text-left border border-gray-100 dark:border-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-gray-100 dark:border-gray-800 gap-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Live Dashboard Preview
                  </span>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                    Wednesday Schedule • B.Tech Computer Science
                  </h3>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync Active
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
                {/* Metric 1 */}
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Overall Attendance</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">82.5%</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 font-medium">
                    ✓ Above 75% target (Can miss 2 classes)
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Current Class</span>
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white truncate">Computer Networks</div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-mono font-semibold">
                    10:00 AM – 11:00 AM • Room LH-301
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Weekly Revision</span>
                    <Mail className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    Week 7 Schedule Attached
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    1 room shift detected • Ready for 1-click review
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FEATURES SECTION ---------------- */}
      <section id="features" className="py-20 bg-gray-50 dark:bg-gray-900/50 border-t border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
              Engineered For Modern College Students
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Everything you need to excel in your semester.
            </p>
            <p className="text-gray-600 dark:text-gray-300 mt-3 text-base sm:text-lg">
              Say goodbye to messy PDF screenshots, attendance spreadsheets, and unexpected attendance shortages.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Smart Visual Timetable</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Color-coded weekly and daily views, room numbers, professors, and live countdowns so you are never late to a lecture or lab.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-5">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Proactive Attendance Math</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Instant calculations tell you whether you are safe to miss an upcoming lecture, or how many consecutive classes you must attend to recover.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-5">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Weekly Email Sync & Diffs</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Colleges email revised timetable PDFs constantly. UniFlow connects with Gmail to extract updates and highlights changes before applying them.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-5">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Free-Slot Discovery</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Automatically identifies free study periods and break intervals between 9 AM and 5 PM to coordinate project meetups and library study sessions.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Offline PWA Capability</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Basement classrooms with zero Wi-Fi? UniFlow works 100% offline via local service worker caching and automatically re-syncs when online.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-7 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Private & Zero-Cost</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                OAuth tokens stored exclusively in protected server-only Firestore vaults. Built entirely within free-tier limits with zero paid subscriptions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS SECTION ---------------- */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
              Fast Setup
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Get in sync in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="p-8 rounded-3xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-800 text-center relative">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/20">
                1
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Create Your Account</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Sign in with Google in 5 seconds or register with your college email address. Email accounts receive a secure 1-click verification link.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-8 rounded-3xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-800 text-center relative">
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-extrabold text-lg flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-500/20">
                2
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Set Your Schedule</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Input your courses, faculty, and lecture timings, or link Gmail to detect incoming college schedule updates automatically.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-8 rounded-3xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-800 text-center relative">
              <div className="w-12 h-12 rounded-full bg-purple-600 text-white font-extrabold text-lg flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/20">
                3
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Track & Maintain 75%+</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Tap 'Present' or 'Absent' daily. Monitor your live attendance threshold and never miss an attendance warning again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FINAL CTA BANNER ---------------- */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 sm:p-14 text-white text-center shadow-2xl shadow-blue-500/20 relative overflow-hidden">
            <div className="max-w-2xl mx-auto relative z-10">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Ready to sync your college life?
              </h2>
              <p className="mt-4 text-blue-100 text-base sm:text-lg">
                Join students staying on top of attendance, lectures, and weekly timetable revisions with UniFlow.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/register" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-white text-blue-600 hover:bg-blue-50 font-bold px-8 shadow-md"
                  >
                    Create Free Account
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/login" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto border-white/40 text-white hover:bg-white/10 font-semibold px-8"
                  >
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="mt-auto border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-lg text-gray-900 dark:text-white">UniFlow</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">Your College Life, In Sync.</span>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <Link to="/login" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Sign In
              </Link>
              <Link to="/register" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Get Started
              </Link>
              <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Features
              </a>
              <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                How It Works
              </a>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              © {new Date().getFullYear()} UniFlow. Progressive Web App.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
