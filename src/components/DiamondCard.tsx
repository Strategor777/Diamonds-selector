import React, { useState } from 'react';
import {
  Camera,
  Check,
  ExternalLink,
  GitCompare,
  Maximize2,
  PlayCircle,
  Scale,
  ShoppingBag,
} from 'lucide-react';
import {
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import { Diamond } from '../types/diamond';
import { DiamondShapeIcon } from './DiamondShapeIcon';
import { DiamondTurntable360 } from './DiamondTurntable360';

interface DiamondCardProps {
  diamond: Diamond;
  isCompared: boolean;
  isInCart?: boolean;
  isWatched?: boolean;
  onInspect: (diamond: Diamond, initialTab?: 'photo' | 'video' | 'cert') => void;
  onToggleCompare: (diamondId: string) => void;
  onToggleCart?: (diamondId: string) => void;
  onFindPair: (diamond: Diamond) => void;
  onToggleWatch?: (diamond: Diamond) => void;
}

export const DiamondCard: React.FC<DiamondCardProps> = React.memo(({
  diamond,
  isCompared,
  isInCart = false,
  onInspect,
  onToggleCompare,
  onToggleCart,
  onFindPair,
}) => {
  const [imgError, setImgError] = useState(false);
  const [mediaView, setMediaView] = useState<'photo' | 'video'>('photo');

  const pricePerCarat = Math.round(diamond.priceUsd / diamond.carat);
  const isColoredStone =
    Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)';
  const colorSwatch = isColoredStone
    ? getColorHexTint(diamond.color, diamond.colorFamily).deep
    : null;
  const stoneTitlePrefix =
    diamond.stoneType && diamond.stoneType !== 'Бриллиант'
      ? `${diamond.stoneType} · `
      : '';

  return (
    <article className="group bg-white border border-[#E4E6EB] rounded-lg overflow-hidden transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(17,19,23,0.06)] flex flex-col">
      {/* Studio Photo / Inline 360° Video Stage */}
      <div className="relative aspect-[4/3] bg-[#F1F3F5] overflow-hidden">
        {mediaView === 'video' ? (
          <DiamondTurntable360 diamond={diamond} compact />
        ) : !imgError ? (
          <img
            src={diamond.imageUrl}
            alt={`${stoneTitlePrefix}${SHAPE_SHORT_RU[diamond.shape]} ${diamond.carat.toFixed(2)} ct ${diamond.color} ${diamond.clarity}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            onClick={() => onInspect(diamond, 'photo')}
            className="w-full h-full object-cover cursor-pointer transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <button
            type="button"
            onClick={() => onInspect(diamond, 'photo')}
            className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F4F6F9] to-[#E7EBEF] text-[#1B365D]"
          >
            <DiamondShapeIcon shape={diamond.shape} className="w-16 h-16" filled />
            <span className="text-xs font-medium text-[#5A606D]">
              {stoneTitlePrefix}
              {SHAPE_SHORT_RU[diamond.shape]} · {diamond.carat.toFixed(2)} ct
            </span>
          </button>
        )}

        {/* Inline Photo / Video Switcher */}
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-0.5 p-0.5 rounded-md bg-white/92 backdrop-blur-sm border border-[#E4E6EB]">
          <button
            type="button"
            onClick={() => setMediaView('photo')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              mediaView === 'photo'
                ? 'bg-[#1B365D] text-white'
                : 'text-[#111317] hover:bg-[#F1F3F5]'
            }`}
            aria-label={`Фото ${diamond.sku}`}
          >
            <Camera className="w-3.5 h-3.5" />
            Фото
          </button>
          <button
            type="button"
            onClick={() => setMediaView('video')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              mediaView === 'video'
                ? 'bg-[#1B365D] text-white'
                : 'text-[#111317] hover:bg-[#F1F3F5]'
            }`}
            aria-label={`Видео 360 для ${diamond.sku}`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Видео 360°
          </button>
        </div>

        {/* Expand Inspector Trigger when viewing Video inline */}
        {mediaView === 'video' && (
          <button
            type="button"
            onClick={() => onInspect(diamond, 'video')}
            title="Развернуть плеер и характеристики"
            aria-label="Развернуть видео 360"
            className="absolute bottom-3 right-3 w-8 h-8 rounded flex items-center justify-center bg-white/92 backdrop-blur-sm border border-[#E4E6EB] text-[#111317] hover:bg-white transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1 justify-between gap-4">
        <div className="space-y-2.5">
          {/* Quiet 1-line unboxed SKU kicker (location hidden) */}
          <div className="flex items-center justify-between gap-2 text-xs text-[#5A606D]">
            <span className="font-mono uppercase tracking-wider truncate">
              {diamond.sku}
            </span>
          </div>

          {/* Primary Title */}
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold text-[#111317] leading-snug min-w-0">
              <button
                type="button"
                onClick={() => onInspect(diamond, 'photo')}
                className="text-left hover:text-[#1B365D] transition-colors"
              >
                {stoneTitlePrefix}
                {SHAPE_SHORT_RU[diamond.shape]} {diamond.carat.toFixed(2)} ct
              </button>
            </h3>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#111317] font-mono tabular-nums whitespace-nowrap shrink-0 max-w-[52%] truncate">
              {colorSwatch && (
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                  style={{ backgroundColor: colorSwatch }}
                />
              )}
              <span className="truncate">
                {diamond.isFancyColor && diamond.fancyIntensity
                  ? diamond.fancyIntensity
                  : diamond.color}{' '}
                · {diamond.clarity}
              </span>
            </span>
          </div>

          {/* Dedicated Fancy Color Grade Line (Full Hue & Overtone) */}
          {diamond.isFancyColor && (
            <div className="text-xs font-medium text-[#1B365D] leading-snug truncate">
              {diamond.color}
              {diamond.overtone &&
              diamond.overtone !== 'Чистый тон (Pure)' &&
              !diamond.color.toLowerCase().includes(diamond.overtone.toLowerCase())
                ? ` · Обертон: ${diamond.overtone}`
                : ''}
            </div>
          )}

          {/* Unboxed Gemological Metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5A606D]">
            {diamond.isFancyColor ? (
              <>
                {diamond.cut && String(diamond.cut) !== 'N/A' && (
                  <>
                    <span>Огранка {diamond.cut}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>Флуор.: {diamond.fluorescence}</span>
                {diamond.colorOrigin && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{diamond.colorOrigin}</span>
                  </>
                )}
              </>
            ) : (
              <span>Огранка {diamond.cut}</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {diamond.lengthMm.toFixed(2)}×{diamond.widthMm.toFixed(2)} мм
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onInspect(diamond, 'cert')}
              className="inline-flex items-center gap-1 text-[#1B365D] hover:underline font-medium"
            >
              {diamond.certLab} #{diamond.certNumber}
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Price Baseline + Controls */}
        <div className="pt-3 border-t border-[#E4E6EB] space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-[#111317] font-mono tabular-nums">
                {formatStonePrice(diamond.priceUsd, diamond.currency)}
              </span>
            </div>
            <span className="text-xs text-[#5A606D] font-mono tabular-nums">
              {formatStonePrice(pricePerCarat, diamond.currency)}/ct
            </span>
          </div>

          <div className="space-y-2">
            {onToggleCart && (
              <button
                type="button"
                onClick={() => onToggleCart(diamond.id)}
                className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  isInCart
                    ? 'bg-[#065F46] border-[#065F46] text-white hover:bg-[#044935]'
                    : 'bg-[#1B365D] border-[#1B365D] text-white hover:bg-[#142947]'
                }`}
              >
                {isInCart ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    В корзине
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5" />
                    В корзину
                  </>
                )}
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onToggleCompare(diamond.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  isCompared
                    ? 'bg-[#1B365D] border-[#1B365D] text-white'
                    : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                }`}
              >
                {isCompared ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    В сравнении
                  </>
                ) : (
                  <>
                    <Scale className="w-3.5 h-3.5" />
                    Сравнить
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onFindPair(diamond)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
              >
                <GitCompare className="w-3.5 h-3.5 text-[#1B365D]" />
                Найти пару
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});
DiamondCard.displayName = 'DiamondCard';
