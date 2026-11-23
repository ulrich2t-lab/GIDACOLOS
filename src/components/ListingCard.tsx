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
    <article className="group bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/50 dark:hover:border-indigo-500/40 shadow-xs">
      <button
        type="button"
        onClick={() => onSelect(listing)}
        className="text-left flex-1 flex flex-col cursor-pointer"
      >
        {/* Image Container (4:3 uniform aspect ratio) */}
        <div className="relative w-full aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-200/80 dark:border-slate-800">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={`${listing.title} — ${listing.neighborhood}, Maradi`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                isRented ? 'opacity-65 grayscale-[30%]' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50/60 dark:from-[#0B1437] dark:via-slate-900 dark:to-slate-900 text-slate-400 dark:text-slate-400 p-6">
              <Home className="w-10 h-10 mb-2 text-[#0B1437]/40 dark:text-indigo-300/60" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">
                {PROPERTY_TYPE_LABELS[listing.propertyType]} · {listing.neighborhood}
              </span>
            </div>
          )}

          {videoCount > 0 && !isRented && (
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-xs text-white text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums">
              <Film className="w-3.5 h-3.5 text-teal-400" />
              <span>
                {videoCount} vidéo{videoCount > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {isReserved && (
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-amber-600/95 text-white text-xs font-bold tracking-wide shadow-xs">
              Réservé
            </div>
          )}

          {isRented && (
            <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center">
              <span className="px-3.5 py-1.5 bg-slate-900/95 text-white text-xs font-bold rounded-lg tracking-wide">
                Pris / Loué
              </span>
            </div>
          )}
        </div>

        {/* Clean Unboxed Card Content with Crisp Android Typography */}
        <div className="p-5 flex-1 flex flex-col justify-between gap-4">
          <div>
            {(listing.isTop || listing.isVerifiedQolock || isShared) && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold mb-2">
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
                    <span>Vérifié</span>
                  </span>
                )}
                {listing.isVerifiedQolock && isShared && (
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                    ·
                  </span>
                )}
                {isShared && (
                  <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
                    <Users className="w-3.5 h-3.5" />
                    <span>Colocation</span>
                  </span>
                )}
              </div>
            )}

            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
              {listing.title}
            </h3>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-medium text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold">
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
              <p className="mt-2 text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {[listing.availability, ...listing.amenities.slice(0, 2)].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between gap-3">
            <div>
              <span className="text-lg font-extrabold text-[#0B1437] dark:text-white tabular-nums">
                {formatFcfa(listing.priceFcfa)}
              </span>
              <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
                {isShared ? ' / pers. / mois' : ' / mois'}
              </span>
            </div>
            <span
              className={`text-[13px] font-bold ${
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
