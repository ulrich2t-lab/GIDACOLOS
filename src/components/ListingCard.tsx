import { CheckCircle2, Film, Home, MapPin, Star, Users } from 'lucide-react';
import {
  BATHROOM_LABELS,
  formatFcfa,
  isSharedListingType,
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from '../lib/formatters';
import type { Listing } from '../types/platform';

interface ListingCardProps {
  listing: Listing;
  onSelect: (listing: Listing) => void;
}

export function ListingCard({ listing, onSelect }: ListingCardProps) {
  const coverPhoto = listing.photos?.[0];
  const videoCount = listing.videos?.length ?? 0;
  const isReserved = listing.status === 'reserved';
  const isRented = listing.status === 'rented';
  const isShared = isSharedListingType(listing.propertyType);

  return (
    <article className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(listing)}
        className="text-left flex-1 flex flex-col cursor-pointer"
      >
        {/* Image Container (4:3 uniform aspect ratio) */}
        <div className="relative w-full aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-200 dark:border-slate-800">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={`${listing.title} — ${listing.neighborhood}, Maradi`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${
                isRented ? 'opacity-65 grayscale-[30%]' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/60 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 text-slate-400 dark:text-slate-500 p-6">
              <Home className="w-9 h-9 mb-2 text-[#0A2540]/40 dark:text-teal-400/50" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
                {PROPERTY_TYPE_LABELS[listing.propertyType]} · {listing.neighborhood}
              </span>
            </div>
          )}

          {videoCount > 0 && !isRented && (
            <div className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded-md bg-slate-950/75 text-white text-[11px] font-medium inline-flex items-center gap-1 tabular-nums">
              <Film className="w-3 h-3 text-teal-400" />
              <span>
                {videoCount} vidéo{videoCount > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {isReserved && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-amber-600/95 text-white text-xs font-semibold tracking-wide shadow-xs">
              Réservé
            </div>
          )}

          {isRented && (
            <div className="absolute inset-0 bg-slate-950/45 flex items-center justify-center">
              <span className="px-3 py-1 bg-slate-900/90 text-white text-xs font-semibold rounded-md tracking-wide">
                Pris / Loué
              </span>
            </div>
          )}
        </div>

        {/* Clean Unboxed Card Content */}
        <div className="p-5 flex-1 flex flex-col justify-between gap-4">
          <div>
            {(listing.isTop || listing.isVerifiedQolock || isShared) && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium mb-1.5">
                {listing.isTop && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>Annonce TOP</span>
                  </span>
                )}
                {listing.isTop && (listing.isVerifiedQolock || isShared) && (
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                    ·
                  </span>
                )}
                {listing.isVerifiedQolock && (
                  <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Vérifié GidaColocs</span>
                  </span>
                )}
                {listing.isVerifiedQolock && isShared && (
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                    ·
                  </span>
                )}
                {isShared && (
                  <span className="inline-flex items-center gap-1 text-[#0A2540] dark:text-sky-300">
                    <Users className="w-3.5 h-3.5" />
                    <span>Espace colocation</span>
                  </span>
                )}
              </div>
            )}

            <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">
              {listing.title}
            </h3>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>{listing.neighborhood}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{PROPERTY_TYPE_LABELS[listing.propertyType]}</span>
              {listing.bathroomType && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{BATHROOM_LABELS[listing.bathroomType]}</span>
                </>
              )}
              {listing.roomsCount && listing.roomsCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {listing.roomsCount} pièce{listing.roomsCount > 1 ? 's' : ''}
                  </span>
                </>
              )}
              {(isShared || listing.availableSpots > 1) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {listing.availableSpots} place{listing.availableSpots > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>

            {(listing.availability || listing.amenities.length > 0) && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                {[listing.availability, ...listing.amenities.slice(0, 2)].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between gap-3">
            <div>
              <span className="text-base font-bold text-[#0A2540] dark:text-white tabular-nums">
                {formatFcfa(listing.priceFcfa)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isShared ? ' / pers. / mois' : ' / mois'}
              </span>
            </div>
            <span
              className={`text-xs font-semibold ${
                isRented
                  ? 'text-slate-500 dark:text-slate-400'
                  : isReserved
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-teal-700 dark:text-teal-400'
              }`}
            >
              {LISTING_STATUS_LABELS[listing.status]}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}
