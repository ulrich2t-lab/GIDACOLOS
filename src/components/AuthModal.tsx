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
      className="fixed inset-0 z-50 bg-[#060B1D]/80 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl overflow-hidden shadow-2xl my-auto">
        <div className="hero-diamond-pattern text-white px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" size="sm" inverted />
            <div>
              <h2
                id="auth-modal-title"
                className="text-base sm:text-lg font-extrabold text-white leading-tight"
              >
                Connexion à votre espace
              </h2>
              <p className="text-xs font-medium text-teal-300 mt-0.5">
                GidaColocs · Code WhatsApp simple &amp; Google
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Fermer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <AuthPanel
            whatsappSupportPrimary={whatsappSupportPrimary}
            onAuthenticated={closeAuthModal}
          />
          <p className="text-xs font-medium text-center text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Accès sécurisé pour étudiants, locataires et bailleurs à Maradi.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
