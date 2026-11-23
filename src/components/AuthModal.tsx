import { ShieldCheck, X } from 'lucide-react';
import { DEFAULT_PLATFORM_CONFIG } from '../lib/constants';
import { useAuth } from '../context/AuthContext';
import { AuthPanel } from './AuthPanel';
import { BrandLogo } from './BrandLogo';

interface AuthModalProps {
  whatsappSupportPrimary?: string;
}

export function AuthModal({
  whatsappSupportPrimary = DEFAULT_PLATFORM_CONFIG.whatsappNumber,
}: AuthModalProps) {
  const { authModalOpen, closeAuthModal } = useAuth();

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl my-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" size="sm" />
            <div>
              <h2
                id="auth-modal-title"
                className="text-base font-bold text-[#0A2540] dark:text-white leading-tight"
              >
                Connexion à votre espace
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                GidaColocs · Code WhatsApp simple &amp; Google
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Fermer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <AuthPanel
            whatsappSupportPrimary={whatsappSupportPrimary}
            onAuthenticated={closeAuthModal}
          />
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Accès sécurisé pour étudiants, locataires et bailleurs à Maradi.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
