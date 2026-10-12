import { Share, PlusSquare, Check, X, Smartphone } from 'lucide-react';
import { Button } from '../ui/button';

interface IOSInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function IOSInstallModal({ open, onClose }: IOSInstallModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Install UniFlow</h3>
              <p className="text-xs text-gray-500">Add to iPhone / iPad Home Screen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
          Install UniFlow on your iOS device for instant timetable access, standalone full-screen experience, and fast offline shell loading:
        </p>

        <div className="space-y-3.5 mb-6">
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
            <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
              1
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-200">
              Tap the <strong className="font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 mx-1">Share <Share className="w-3.5 h-3.5" /></strong> button in the Safari navigation bar at the bottom.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
            <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
              2
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-200">
              Scroll down the share sheet and tap <strong className="font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1 mx-1">Add to Home Screen <PlusSquare className="w-3.5 h-3.5 text-blue-600" /></strong>.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
            <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
              3
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-200">
              Tap <strong className="font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1 mx-1">Add <Check className="w-3.5 h-3.5 text-emerald-600" /></strong> in the top-right corner to complete installation.
            </div>
          </div>
        </div>

        <Button onClick={onClose} className="w-full font-bold">
          Got it
        </Button>
      </div>
    </div>
  );
}
