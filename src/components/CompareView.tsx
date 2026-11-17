import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  GitCompare,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_COLORS,
  FANCY_INTENSITY_RANK,
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import { Diamond } from '../types/diamond';
import { DiamondShapeIcon } from './DiamondShapeIcon';

interface CompareViewProps {
  diamonds: Diamond[];
  onRemove: (diamondId: string) => void;
  onClearAll: () => void;
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onFindPair: (diamond: Diamond) => void;
  onExportSheets: (stones: Diamond[], label: string) => void;
  onGoToCatalog: () => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  diamonds,
  onRemove,
  onClearAll,
  onInspect,
  onFindPair,
  onExportSheets,
  onGoToCatalog,
}) => {
  if (diamonds.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-6 py-14">
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-10 text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl font-semibold text-[#111317]">
            Сравнение характеристик камней
          </h2>
          <p className="text-sm text-[#5A606D] leading-relaxed">
            Выберите от 2 до 4 бриллиантов в каталоге или в подборе пары, чтобы сравнить
            пропорции в миллиметрах, цвет, чистоту, сертификаты и цену за карат.
          </p>
          <button
            type="button"
            onClick={onGoToCatalog}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Выбрать камни в каталоге
          </button>
        </div>
      </section>
    );
  }

  const lowestPricePerCt = Math.min(
    ...diamonds.map((d) => Math.round(d.priceUsd / d.carat))
  );
  const validColorIndices = diamonds
    .map((d) => ALL_COLORS.indexOf(d.color))
    .filter((idx) => idx >= 0);
  const bestColorIdx =
    validColorIndices.length > 0 ? Math.min(...validColorIndices) : -1;
  const validClarityIndices = diamonds
    .map((d) => ALL_CLARITIES.indexOf(d.clarity))
    .filter((idx) => idx >= 0);
  const bestClarityIdx =
    validClarityIndices.length > 0 ? Math.min(...validClarityIndices) : -1;
  const maxCarat = Math.max(...diamonds.map((d) => d.carat));
  const maxDimMm = Math.max(
    ...diamonds.map((d) => Math.max(d.lengthMm, d.widthMm))
  );
  const hasFancyDiamonds = diamonds.some((d) => Boolean(d.isFancyColor));
  const intensityRanks = diamonds
    .map((d) => FANCY_INTENSITY_RANK[d.fancyIntensity || ''] || 0)
    .filter((r) => r > 0);
  const bestIntensityRank =
    intensityRanks.length > 1 ? Math.max(...intensityRanks) : 0;

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#E4E6EB]">
        <div>
          <h2 className="text-3xl font-semibold text-[#111317]">
            Сравнение выбранных бриллиантов ({diamonds.length}/4)
          </h2>
          <p className="text-sm text-[#5A606D] mt-1">
            Визуальная шкала размеров в реальных пропорциях миллиметров и полная таблица
            геммологических параметров.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() =>
              onExportSheets(diamonds, `Сравнение ${diamonds.length} бриллиантов`)
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Экспорт в Google Таблицы
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистить список
          </button>
        </div>
      </div>

      {/* True-to-Scale Proportional Silhouette Comparison */}
      <div className="bg-white border border-[#E4E6EB] rounded-xl p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-semibold text-[#111317]">
              Визуальное сопоставление реальных размеров (мм)
            </h3>
            <p className="text-xs text-[#5A606D]">
              Масштаб откалиброван относительно самого крупного камня в выборке (
              <span className="font-mono tabular-nums">{maxDimMm.toFixed(2)} мм</span>)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {diamonds.map((d) => {
            const scaleFactor = Math.max(d.lengthMm, d.widthMm) / Math.max(maxDimMm, 1);
            const boxPx = Math.round(92 * scaleFactor);
            return (
              <div
                key={d.id}
                className="flex flex-col items-center justify-between p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg gap-3"
              >
                <div className="h-28 flex items-center justify-center">
                  <div
                    style={{
                      width: `${boxPx}px`,
                      height: `${boxPx}px`,
                      color:
                        d.colorFamily && d.colorFamily !== 'Бесцветный (D–J)'
                          ? getColorHexTint(d.color, d.colorFamily).deep
                          : '#1B365D',
                    }}
                    className="flex items-center justify-center transition-all duration-200"
                  >
                    <DiamondShapeIcon shape={d.shape} className="w-full h-full" filled />
                  </div>
                </div>
                <div className="text-center space-y-0.5">
                  <div className="text-xs font-mono text-[#5A606D]">{d.sku}</div>
                  <div className="text-sm font-semibold text-[#111317] font-mono tabular-nums">
                    {d.lengthMm.toFixed(2)} × {d.widthMm.toFixed(2)} мм
                  </div>
                  <div className="text-xs text-[#5A606D]">
                    {SHAPE_SHORT_RU[d.shape]} · {d.carat.toFixed(2)} ct
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Precision Spec Matrix Table */}
      <div className="bg-white border border-[#E4E6EB] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-[#E4E6EB] bg-[#FAFAFA]">
                <th className="p-4 text-xs font-medium text-[#5A606D] w-48 align-top">
                  Параметр
                </th>
                {diamonds.map((d) => (
                  <th key={d.id} className="p-4 align-top min-w-[180px]">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onInspect(d, 'photo')}
                        className="text-left group"
                      >
                        <div className="text-xs font-mono text-[#5A606D]">{d.sku}</div>
                        <div className="text-sm font-semibold text-[#111317] group-hover:text-[#1B365D] transition-colors mt-0.5">
                          {d.stoneType && d.stoneType !== 'Бриллиант'
                            ? `${d.stoneType} · `
                            : ''}
                          {SHAPE_SHORT_RU[d.shape]} {d.carat.toFixed(2)} ct
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(d.id)}
                        aria-label={`Удалить ${d.sku} из сравнения`}
                        className="p-1 rounded text-[#6B7280] hover:text-[#111317] hover:bg-[#EAECEF] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E6EB] text-sm">
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Стоимость</td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4 font-mono tabular-nums font-semibold text-[#111317]">
                    {formatStonePrice(d.priceUsd, d.currency)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Цена за карат</td>
                {diamonds.map((d) => {
                  const perCt = Math.round(d.priceUsd / d.carat);
                  const isBest = diamonds.length > 1 && perCt === lowestPricePerCt;
                  return (
                    <td key={d.id} className="p-4 font-mono tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[#111317]">
                          {formatStonePrice(perCt, d.currency)}/ct
                        </span>
                        {isBest && (
                          <span className="inline-flex items-center gap-1 text-xs font-sans text-[#0F5132] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Выгоднее
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Вес (карат)</td>
                {diamonds.map((d) => {
                  const isTop = diamonds.length > 1 && d.carat === maxCarat;
                  return (
                    <td key={d.id} className="p-4 font-mono tabular-nums">
                      <span className="text-[#111317] font-medium">
                        {d.carat.toFixed(2)} ct
                      </span>
                      {isTop && (
                        <span className="ml-2 text-xs font-sans text-[#1B365D] font-medium">
                          Крупнейший
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Цвет</td>
                {diamonds.map((d) => {
                  const isBest =
                    diamonds.length > 1 &&
                    bestColorIdx >= 0 &&
                    ALL_COLORS.indexOf(d.color) === bestColorIdx;
                  return (
                    <td key={d.id} className="p-4 font-mono">
                      <span className="font-semibold text-[#111317]">{d.color}</span>
                      {isBest && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-sans text-[#1B365D] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Высший
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {hasFancyDiamonds && (
                <>
                  <tr>
                    <td className="p-4 text-xs font-medium text-[#5A606D]">
                      Интенсивность (Intensity)
                    </td>
                    {diamonds.map((d) => {
                      const rank = FANCY_INTENSITY_RANK[d.fancyIntensity || ''] || 0;
                      const isBest = bestIntensityRank > 0 && rank === bestIntensityRank;
                      return (
                        <td key={d.id} className="p-4 text-xs text-[#111317]">
                          <span className="font-semibold">
                            {d.fancyIntensity || '—'}
                          </span>
                          {isBest && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-sans text-[#1B365D] font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Насыщеннее
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="p-4 text-xs font-medium text-[#5A606D]">
                      Тон / Обертон
                    </td>
                    {diamonds.map((d) => (
                      <td key={d.id} className="p-4 text-xs text-[#111317]">
                        {d.isFancyColor
                          ? `${d.primaryHue || '—'} · ${d.overtone || 'Чистый тон'}`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 text-xs font-medium text-[#5A606D]">
                      Происхождение / Распределение
                    </td>
                    {diamonds.map((d) => (
                      <td key={d.id} className="p-4 text-xs text-[#111317]">
                        {d.isFancyColor
                          ? `${d.colorOrigin || 'Natural'} · ${d.colorDistribution || 'Even'}`
                          : 'Natural'}
                      </td>
                    ))}
                  </tr>
                </>
              )}
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Чистота</td>
                {diamonds.map((d) => {
                  const isBest =
                    diamonds.length > 1 &&
                    ALL_CLARITIES.indexOf(d.clarity) === bestClarityIdx;
                  return (
                    <td key={d.id} className="p-4 font-mono">
                      <span className="font-semibold text-[#111317]">{d.clarity}</span>
                      {isBest && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-sans text-[#1B365D] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Высшая
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">
                  Огранка / Полировка / Симметрия
                </td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4 text-xs text-[#111317]">
                    {d.cut} · {d.polish} · {d.symmetry}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Размеры (Д × Ш × В)</td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4 font-mono tabular-nums text-xs text-[#111317]">
                    {d.lengthMm.toFixed(2)} × {d.widthMm.toFixed(2)} × {d.depthMm.toFixed(2)} мм
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">
                  Глубина / Площадка / L:W
                </td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4 font-mono tabular-nums text-xs text-[#111317]">
                    {d.depthPercent.toFixed(1)}% · {d.tablePercent.toFixed(1)}% · {d.lwRatio.toFixed(2)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Флуоресценция</td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4 text-xs text-[#111317]">
                    {d.fluorescence}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs font-medium text-[#5A606D]">Сертификат</td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4">
                    <a
                      href={d.certUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono font-medium text-[#1B365D] hover:underline"
                    >
                      {d.certLab} #{d.certNumber}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                ))}
              </tr>
              <tr className="bg-[#FAFAFA]">
                <td className="p-4 text-xs font-medium text-[#5A606D]">Действия</td>
                {diamonds.map((d) => (
                  <td key={d.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onInspect(d, 'video')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                      >
                        360° и фото
                      </button>
                      <button
                        type="button"
                        onClick={() => onFindPair(d)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-[#D5D9E0] bg-white text-[#1B365D] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        Пара
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
