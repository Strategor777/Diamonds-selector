import React, { useEffect, useState } from 'react';
import {
  Award,
  Camera,
  Check,
  ExternalLink,
  GitCompare,
  PlayCircle,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import {
  SHAPE_LABELS_RU,
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import {
  applyVerifiedColorToDiamond,
  buildManualColorVerification,
  getCalibratedStudioVisual,
  hasExternalSupplierPhoto,
  isVerifiableCertNumber,
  verifyCertificateColor,
} from '../lib/certVerification';
import type { CertVerifyResponse } from '../lib/certVerifyTypes';
import {
  isNonImageMediaUrl,
  parseFancyColor,
  sanitizeMediaUrl,
} from '../lib/fancyColorParser';
import { Diamond } from '../types/diamond';
import { DiamondShapeIcon } from './DiamondShapeIcon';
import { DiamondTurntable360 } from './DiamondTurntable360';

interface DiamondDetailModalProps {
  diamond: Diamond | null;
  initialTab?: 'photo' | 'video' | 'cert';
  isCompared: boolean;
  isInCart?: boolean;
  isWatched?: boolean;
  onClose: () => void;
  onToggleCompare: (diamondId: string) => void;
  onToggleCart?: (diamondId: string) => void;
  onFindPair: (diamond: Diamond) => void;
  onToggleWatch?: (diamond: Diamond) => void;
  onUpdateDiamond?: (updated: Diamond) => void;
}

export const DiamondDetailModal: React.FC<DiamondDetailModalProps> = ({
  diamond,
  initialTab = 'photo',
  isCompared,
  isInCart = false,
  onClose,
  onToggleCompare,
  onToggleCart,
  onFindPair,
  onUpdateDiamond,
}) => {
  const [activeTab, setActiveTab] = useState<'photo' | 'video' | 'cert'>(initialTab);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [loupePos, setLoupePos] = useState({ x: 50, y: 50 });
  const [imgStage, setImgStage] = useState<0 | 1 | 2>(0);

  // Automatic certificate color verification state
  const [verifyState, setVerifyState] = useState<
    'idle' | 'checking' | 'done'
  >('idle');
  const [verifyResult, setVerifyResult] = useState<CertVerifyResponse | null>(null);
  const [manualColorInput, setManualColorInput] = useState('');
  const [manualApplyStudio, setManualApplyStudio] = useState(true);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const studioVisual = diamond ? getCalibratedStudioVisual(diamond) : undefined;
  const studioFallbackSrc = studioVisual?.src;
  const rawSanitized = diamond ? sanitizeMediaUrl(diamond.imageUrl) : undefined;
  const externalPhotoAvailable = diamond ? hasExternalSupplierPhoto(diamond) : false;
  const primarySrc =
    diamond &&
    !diamond.useStudioPhoto &&
    rawSanitized &&
    !isNonImageMediaUrl(rawSanitized)
      ? rawSanitized
      : undefined;

  useEffect(() => {
    setActiveTab(initialTab);
    setLoupeEnabled(false);
    setImgStage(primarySrc && primarySrc !== studioFallbackSrc ? 0 : 1);
  }, [diamond?.id, initialTab, primarySrc, studioFallbackSrc, diamond?.useStudioPhoto]);

  useEffect(() => {
    setVerifyNotice(null);
    setManualColorInput('');
    setManualApplyStudio(true);
  }, [diamond?.id]);

  // Automatic certificate color verification when opening a stone with a real cert number
  useEffect(() => {
    if (!diamond) return;
    if (!isVerifiableCertNumber(diamond.certNumber)) {
      setVerifyState('idle');
      setVerifyResult(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setVerifyState('checking');

    verifyCertificateColor(diamond.certLab, diamond.certNumber, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!active) return;
        setVerifyResult(res);
        setVerifyState('done');

        // Auto-apply verified certificate color & calibrated studio photo if needed
        if (
          res.status === 'verified' &&
          res.normalizedColor &&
          onUpdateDiamond &&
          (!diamond.certColorVerified ||
            diamond.certVerifiedColor !== res.normalizedColor)
        ) {
          const colorChanged =
            diamond.color.trim().toLowerCase() !==
            res.normalizedColor.trim().toLowerCase();
          const updated = applyVerifiedColorToDiamond(diamond, res, {
            useStudioPhoto:
              diamond.useStudioPhoto || !hasExternalSupplierPhoto(diamond) || colorChanged,
            source: 'auto',
          });
          onUpdateDiamond(updated);
          setVerifyNotice(
            colorChanged
              ? `Цвет автоматически уточнён по сертификату ${res.lab}: ${res.normalizedColor}. Подобрано студийное фото.`
              : `Цвет ${res.normalizedColor} подтверждён на сайте ${res.lab}.`
          );
        }
      })
      .catch(() => {
        if (!active) return;
        setVerifyState('idle');
      });

    return () => {
      active = false;
      controller.abort();
    };
    // Trigger only when switching stone or certificate number
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diamond?.id, diamond?.certLab, diamond?.certNumber]);

  useEffect(() => {
    if (!diamond) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [diamond, onClose]);

  if (!diamond || !studioVisual) return null;

  const activeImgSrc =
    imgStage === 0 ? primarySrc : imgStage === 1 ? studioFallbackSrc : undefined;
  const isShowingStudio = imgStage === 1;

  const pricePerCarat =
    diamond.carat > 0 ? Math.round(diamond.priceUsd / diamond.carat) : diamond.priceUsd;
  const isColoredStone =
    Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)';
  const parsedFancy = isColoredStone ? parseFancyColor(diamond.color) : null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!loupeEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setLoupePos({ x, y });
  };

  const handleManualVerifyRefresh = async () => {
    setVerifyState('checking');
    setVerifyNotice(null);
    try {
      const res = await verifyCertificateColor(diamond.certLab, diamond.certNumber, {
        bypassCache: true,
      });
      setVerifyResult(res);
      setVerifyState('done');
      if (res.status === 'verified' && res.normalizedColor && onUpdateDiamond) {
        const updated = applyVerifiedColorToDiamond(diamond, res, {
          useStudioPhoto:
            diamond.useStudioPhoto || !hasExternalSupplierPhoto(diamond) || true,
          source: 'auto',
        });
        onUpdateDiamond(updated);
        setVerifyNotice(
          `Цвет «${res.normalizedColor}» подтверждён по сайту ${res.lab} и сохранён.`
        );
      }
    } catch {
      setVerifyState('done');
    }
  };

  const handleApplyManualCertColor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateDiamond) return;
    const verified = buildManualColorVerification(
      diamond.certLab,
      diamond.certNumber,
      manualColorInput
    );
    if (!verified) return;
    const updated = applyVerifiedColorToDiamond(diamond, verified, {
      useStudioPhoto: manualApplyStudio,
      source: 'manual',
    });
    onUpdateDiamond(updated);
    setVerifyResult(verified);
    setVerifyState('done');
    setManualColorInput('');
    setVerifyNotice(
      manualApplyStudio
        ? `Применён цвет сертификата «${verified.normalizedColor}» и назначено студийное фото под эти характеристики.`
        : `Применён цвет сертификата «${verified.normalizedColor}».`
    );
  };

  const handleTogglePhotoSource = (preferStudio: boolean) => {
    if (onUpdateDiamond) {
      onUpdateDiamond({
        ...diamond,
        useStudioPhoto: preferStudio,
      });
    }
    setImgStage(preferStudio ? 1 : primarySrc ? 0 : 1);
  };

  const imgStyle: React.CSSProperties | undefined = (() => {
    const style: React.CSSProperties = {};
    if (loupeEnabled) {
      style.transform = 'scale(2.4)';
      style.transformOrigin = `${loupePos.x}% ${loupePos.y}%`;
    }
    if (isShowingStudio && studioVisual.filter) {
      style.filter = studioVisual.filter;
    }
    return Object.keys(style).length > 0 ? style : undefined;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/55 backdrop-blur-xs p-2.5 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Карточка бриллианта ${diamond.sku}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#E4E6EB] rounded-xl max-w-5xl w-full min-w-0 overflow-hidden shadow-2xl my-auto">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <DiamondShapeIcon
              shape={diamond.shape}
              className="w-6 h-6 sm:w-7 sm:h-7 text-[#1B365D] shrink-0"
              filled
            />
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs text-[#5A606D] font-mono truncate">
                {diamond.sku} · {diamond.certLab} #{diamond.certNumber}
              </div>
              <h2 className="text-lg sm:text-2xl font-semibold text-[#111317] truncate">
                {diamond.stoneType &&
                diamond.stoneType !== 'Бриллиант' &&
                diamond.stoneType !== 'Цветной бриллиант'
                  ? `${diamond.stoneType} · `
                  : ''}
                {SHAPE_LABELS_RU[diamond.shape]} — {diamond.carat.toFixed(2)} ct
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-Column Inspector Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-w-0">
          {/* Left Media / 360 / Certificate Stage */}
          <div className="lg:col-span-7 min-w-0 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-[#E4E6EB] space-y-4 bg-[#FAFAFA]">
            {/* Media Mode Tabs */}
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EAECEF] rounded-lg max-w-full">
                <button
                  type="button"
                  onClick={() => setActiveTab('photo')}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'photo'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  Фото и лупа
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('video')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'video'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Видео 360°
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cert')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'cert'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  Сертификат {diamond.certLab}
                </button>
              </div>

              {activeTab === 'photo' && (
                <div className="flex items-center gap-2 flex-wrap">
                  {externalPhotoAvailable && (
                    <button
                      type="button"
                      onClick={() => handleTogglePhotoSource(!isShowingStudio)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                        isShowingStudio
                          ? 'bg-[#F4F7FB] border-[#1B365D] text-[#1B365D]'
                          : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                      }`}
                    >
                      {isShowingStudio ? (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          Фото поставщика
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#1B365D]" />
                          Студийное фото
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLoupeEnabled((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                      loupeEnabled
                        ? 'bg-[#1B365D] border-[#1B365D] text-white'
                        : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    {loupeEnabled ? 'Лупа 10× активна' : 'Лупа 10×'}
                  </button>
                </div>
              )}
            </div>

            {/* Active Stage Content */}
            {activeTab === 'photo' && (
              <div className="space-y-2">
                <div
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => {
                    if (loupeEnabled) setLoupePos({ x: 50, y: 50 });
                  }}
                  className={`relative aspect-square max-h-[460px] w-full mx-auto rounded-lg overflow-hidden border border-[#E4E6EB] bg-[#F8F9FB] ${
                    loupeEnabled ? 'cursor-zoom-in' : ''
                  }`}
                >
                  {activeImgSrc ? (
                    <img
                      src={activeImgSrc}
                      alt={`${SHAPE_SHORT_RU[diamond.shape]} ${diamond.carat.toFixed(2)} ct`}
                      referrerPolicy="no-referrer"
                      onError={() => setImgStage((prev) => (prev === 0 ? 1 : 2))}
                      style={imgStyle}
                      className="w-full h-full object-contain p-3 transition-transform duration-150 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[#1B365D]">
                      <DiamondShapeIcon shape={diamond.shape} className="w-24 h-24" filled />
                      <span className="text-sm font-medium text-[#5A606D]">
                        {SHAPE_LABELS_RU[diamond.shape]}
                      </span>
                    </div>
                  )}

                  <div className="absolute bottom-2.5 right-2.5 max-w-[calc(100%-20px)] truncate px-2.5 py-1 bg-white/92 backdrop-blur-sm border border-[#E4E6EB] rounded text-xs font-mono tabular-nums text-[#111317]">
                    {diamond.lengthMm.toFixed(2)} × {diamond.widthMm.toFixed(2)} ×{' '}
                    {diamond.depthMm.toFixed(2)} мм
                  </div>
                </div>

                {isShowingStudio && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#5A606D] px-1">
                    <span className="truncate">{studioVisual.label}</span>
                    {diamond.certColorVerified && (
                      <span className="text-[#065F46] font-medium whitespace-nowrap shrink-0">
                        Откалибровано по сертификату {diamond.certLab}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'video' && <DiamondTurntable360 diamond={diamond} />}

            {activeTab === 'cert' && (
              <div className="bg-white border border-[#E4E6EB] rounded-lg p-5 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E4E6EB]">
                  <div>
                    <div className="text-xs text-[#5A606D]">Геммологический отчёт</div>
                    <h3 className="text-xl font-semibold text-[#111317] font-mono tabular-nums mt-0.5">
                      {diamond.certLab} Report #{diamond.certNumber}
                    </h3>
                    <div className="text-xs text-[#5A606D] mt-1">
                      Дата выдачи:{' '}
                      <span className="font-mono">{diamond.certDate || '—'}</span> ·
                      Лазерная гравировка на рундисте
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isVerifiableCertNumber(diamond.certNumber) && (
                      <button
                        type="button"
                        disabled={verifyState === 'checking'}
                        onClick={handleManualVerifyRefresh}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            verifyState === 'checking' ? 'animate-spin' : ''
                          }`}
                        />
                        Проверить цвет
                      </button>
                    )}
                    <a
                      href={diamond.certUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
                    >
                      Открыть на сайте {diamond.certLab}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Proportions Diagram + Key Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                  <div className="bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg p-4">
                    <div className="text-xs font-medium text-[#5A606D] mb-3">
                      Схема пропорций огранки
                    </div>
                    <svg viewBox="0 0 220 135" className="w-full h-auto text-[#1B365D]">
                      <line
                        x1="65"
                        y1="22"
                        x2="155"
                        y2="22"
                        stroke="#9CA3AF"
                        strokeDasharray="3 2"
                      />
                      <text
                        x="110"
                        y="15"
                        textAnchor="middle"
                        fontSize="10"
                        fill="#111317"
                        fontFamily="JetBrains Mono"
                      >
                        Площадка {diamond.tablePercent}%
                      </text>
                      <polygon
                        points="65,30 155,30 190,54 190,60 110,120 30,60 30,54"
                        fill="rgba(27, 54, 93, 0.06)"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="30"
                        y1="54"
                        x2="190"
                        y2="54"
                        stroke="currentColor"
                        strokeWidth="1"
                        opacity="0.6"
                      />
                      <line
                        x1="30"
                        y1="60"
                        x2="190"
                        y2="60"
                        stroke="currentColor"
                        strokeWidth="1"
                        opacity="0.6"
                      />
                      <line
                        x1="65"
                        y1="30"
                        x2="88"
                        y2="54"
                        stroke="currentColor"
                        strokeWidth="0.9"
                        opacity="0.5"
                      />
                      <line
                        x1="155"
                        y1="30"
                        x2="132"
                        y2="54"
                        stroke="currentColor"
                        strokeWidth="0.9"
                        opacity="0.5"
                      />
                      <line
                        x1="88"
                        y1="60"
                        x2="110"
                        y2="120"
                        stroke="currentColor"
                        strokeWidth="0.9"
                        opacity="0.5"
                      />
                      <line
                        x1="132"
                        y1="60"
                        x2="110"
                        y2="120"
                        stroke="currentColor"
                        strokeWidth="0.9"
                        opacity="0.5"
                      />
                      <line
                        x1="202"
                        y1="30"
                        x2="202"
                        y2="120"
                        stroke="#9CA3AF"
                        strokeDasharray="2 2"
                      />
                      <text
                        x="206"
                        y="78"
                        fontSize="9.5"
                        fill="#111317"
                        fontFamily="JetBrains Mono"
                      >
                        {diamond.depthPercent}%
                      </text>
                      <text
                        x="48"
                        y="47"
                        fontSize="9"
                        fill="#5A606D"
                        fontFamily="JetBrains Mono"
                      >
                        {diamond.crownAngle}°
                      </text>
                      <text
                        x="54"
                        y="92"
                        fontSize="9"
                        fill="#5A606D"
                        fontFamily="JetBrains Mono"
                      >
                        {diamond.pavilionAngle}°
                      </text>
                    </svg>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    <div>
                      <dt className="text-[#5A606D]">Глубина</dt>
                      <dd className="font-mono tabular-nums font-medium text-[#111317]">
                        {diamond.depthPercent.toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#5A606D]">Площадка</dt>
                      <dd className="font-mono tabular-nums font-medium text-[#111317]">
                        {diamond.tablePercent.toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#5A606D]">Угол короны</dt>
                      <dd className="font-mono tabular-nums font-medium text-[#111317]">
                        {diamond.crownAngle.toFixed(1)}°
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#5A606D]">Угол павильона</dt>
                      <dd className="font-mono tabular-nums font-medium text-[#111317]">
                        {diamond.pavilionAngle.toFixed(1)}°
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#5A606D]">Рундист</dt>
                      <dd className="font-medium text-[#111317]">{diamond.girdle}</dd>
                    </div>
                    <div>
                      <dt className="text-[#5A606D]">Калетта</dt>
                      <dd className="font-medium text-[#111317]">{diamond.culet}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>

          {/* Right Contiguous Specifications & Actions Module */}
          <div className="lg:col-span-5 min-w-0 p-4 sm:p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4 min-w-0">
              {/* Price Display */}
              <div className="pb-4 border-b border-[#E4E6EB]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-2xl sm:text-3xl font-semibold text-[#111317] font-mono tabular-nums">
                    {formatStonePrice(diamond.priceUsd, diamond.currency)}
                  </span>
                  <span className="text-xs sm:text-sm text-[#5A606D] font-mono tabular-nums whitespace-nowrap">
                    {formatStonePrice(pricePerCarat, diamond.currency)} / ct
                  </span>
                </div>
              </div>

              {/* 4Cs & Optical Specs */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="border-b border-[#F1F3F5] pb-2 min-w-0">
                  <dt className="text-xs text-[#5A606D]">Каратность</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#111317] mt-0.5">
                    {diamond.carat.toFixed(2)} ct
                  </dd>
                </div>
                <div className="border-b border-[#F1F3F5] pb-2 min-w-0">
                  <dt className="text-xs text-[#5A606D]">
                    {isColoredStone
                      ? parsedFancy?.isSpecificShade
                        ? 'Цвет и оттенок'
                        : 'Основной цвет'
                      : 'Цвет (D–J)'}
                  </dt>
                  <dd className="font-semibold text-[#111317] mt-0.5 flex items-center gap-1.5 min-w-0">
                    {isColoredStone && (
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                        style={{
                          backgroundColor: getColorHexTint(
                            diamond.color,
                            diamond.colorFamily
                          ).deep,
                        }}
                      />
                    )}
                    <span className="truncate font-mono">
                      {isColoredStone
                        ? parsedFancy?.isSpecificShade
                          ? parsedFancy.canonicalColor
                          : diamond.colorFamily || diamond.color
                        : diamond.color}
                    </span>
                  </dd>
                  {isColoredStone &&
                    (parsedFancy?.shortCode ||
                      diamond.fancyIntensity ||
                      diamond.fancyOvertone) && (
                      <div className="text-[11px] text-[#5A606D] mt-0.5 truncate">
                        {[
                          parsedFancy?.shortCode,
                          diamond.fancyIntensity,
                          diamond.fancyOvertone,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                </div>
                <div className="border-b border-[#F1F3F5] pb-2">
                  <dt className="text-xs text-[#5A606D]">Чистота</dt>
                  <dd className="font-mono font-semibold text-[#111317] mt-0.5">
                    {diamond.clarity}
                  </dd>
                </div>
                <div className="border-b border-[#F1F3F5] pb-2">
                  <dt className="text-xs text-[#5A606D]">Огранка</dt>
                  <dd className="font-semibold text-[#111317] mt-0.5">{diamond.cut}</dd>
                </div>
                <div className="border-b border-[#F1F3F5] pb-2">
                  <dt className="text-xs text-[#5A606D]">Полировка / Симметрия</dt>
                  <dd className="font-medium text-[#111317] mt-0.5">
                    {diamond.polish} / {diamond.symmetry}
                  </dd>
                </div>
                <div className="border-b border-[#F1F3F5] pb-2">
                  <dt className="text-xs text-[#5A606D]">Флуоресценция</dt>
                  <dd className="font-medium text-[#111317] mt-0.5">
                    {diamond.fluorescence}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#5A606D]">Размеры (Д × Ш × В)</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#111317] mt-0.5">
                    {diamond.lengthMm.toFixed(2)} × {diamond.widthMm.toFixed(2)} ×{' '}
                    {diamond.depthMm.toFixed(2)} мм
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#5A606D]">Отношение L/W</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#111317] mt-0.5">
                    {diamond.lwRatio.toFixed(2)}
                  </dd>
                </div>
              </dl>

              {/* Certificate Color Verification Module */}
              <div className="p-3.5 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-[#5A606D]">
                      <ShieldCheck
                        className={`w-3.5 h-3.5 shrink-0 ${
                          diamond.certColorVerified
                            ? 'text-[#065F46]'
                            : 'text-[#1B365D]'
                        }`}
                      />
                      <span>Верификация цвета по сертификату</span>
                    </div>
                    <div className="text-sm font-mono font-semibold text-[#111317] truncate mt-0.5">
                      {diamond.certLab} #{diamond.certNumber}
                    </div>
                  </div>
                  <a
                    href={diamond.certUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#D5D9E0] bg-white text-[#1B365D] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap shrink-0"
                  >
                    Бланк
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {verifyState === 'checking' && (
                  <div className="text-xs text-[#5A606D] flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B365D] shrink-0" />
                    <span>Проверка цвета в реестре {diamond.certLab}...</span>
                  </div>
                )}

                {verifyNotice && (
                  <div className="text-xs text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] rounded-md px-2.5 py-1.5 leading-snug">
                    {verifyNotice}
                  </div>
                )}

                {verifyState !== 'checking' &&
                  diamond.certColorVerified &&
                  !verifyNotice && (
                    <div className="text-xs text-[#065F46] leading-snug">
                      Цвет{' '}
                      <span className="font-mono font-semibold">
                        {diamond.certVerifiedColor || diamond.color}
                      </span>{' '}
                      подтверждён по сертификату {diamond.certLab}.
                    </div>
                  )}

                {verifyState === 'done' &&
                  verifyResult &&
                  verifyResult.status !== 'verified' &&
                  onUpdateDiamond && (
                    <div className="space-y-2 pt-1 border-t border-[#E4E6EB]">
                      <p className="text-[11px] text-[#5A606D] leading-snug">
                        {verifyResult.message}
                      </p>
                      <form onSubmit={handleApplyManualCertColor} className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={manualColorInput}
                            onChange={(e) => setManualColorInput(e.target.value)}
                            placeholder="Цвет из бланка: FIP, Fancy Vivid Blue, E..."
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-[#D5D9E0] rounded-md text-[#111317] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#1B365D]"
                          />
                          <button
                            type="submit"
                            disabled={!manualColorInput.trim()}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-40 whitespace-nowrap shrink-0"
                          >
                            Применить
                          </button>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#5A606D] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualApplyStudio}
                            onChange={(e) => setManualApplyStudio(e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#1B365D]"
                          />
                          Использовать студийное фото под этот цвет и оттенок
                        </label>
                      </form>
                    </div>
                  )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              {onToggleCart && (
                <button
                  type="button"
                  onClick={() => onToggleCart(diamond.id)}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isInCart
                      ? 'bg-[#065F46] text-white hover:bg-[#044935]'
                      : 'bg-[#1B365D] text-white hover:bg-[#142947]'
                  }`}
                >
                  {isInCart ? (
                    <>
                      <Check className="w-4 h-4" />
                      В корзине (нажмите, чтобы убрать)
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      В корзину
                    </>
                  )}
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onToggleCompare(diamond.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap min-w-0 ${
                    isCompared
                      ? 'bg-[#1B365D] border-[#1B365D] text-white'
                      : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                  }`}
                >
                  {isCompared ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      <span className="truncate">В сравнении</span>
                    </>
                  ) : (
                    <>
                      <Scale className="w-4 h-4 shrink-0" />
                      <span className="truncate">Сравнить</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFindPair(diamond);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap min-w-0"
                >
                  <GitCompare className="w-4 h-4 text-[#1B365D] shrink-0" />
                  <span className="truncate">Найти пару</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
