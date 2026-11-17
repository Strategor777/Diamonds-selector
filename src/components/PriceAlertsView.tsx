import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ALL_COLORS,
  ALL_SHAPES,
  SHAPE_SHORT_RU,
  formatStonePrice,
} from '../data/diamonds';
import {
  Diamond,
  DiamondColor,
  DiamondShape,
  PriceAlertRule,
  PriceDropNotification,
} from '../types/diamond';

interface PriceAlertsViewProps {
  catalog: Diamond[];
  rules: PriceAlertRule[];
  notifications: PriceDropNotification[];
  liveMonitoring: boolean;
  soundEnabled: boolean;
  onToggleLiveMonitoring: () => void;
  onToggleSound: () => void;
  onTriggerPriceCheckNow: () => void;
  onAddRule: (rule: Omit<PriceAlertRule, 'id' | 'createdAt'>) => void;
  onDeleteRule: (ruleId: string) => void;
  onToggleRuleActive: (ruleId: string) => void;
  onMarkAllRead: () => void;
  onInspectDiamond: (diamondId: string) => void;
  onExportAlertsToSheets: () => void;
}

export const PriceAlertsView: React.FC<PriceAlertsViewProps> = ({
  catalog,
  rules,
  notifications,
  liveMonitoring,
  soundEnabled,
  onToggleLiveMonitoring,
  onToggleSound,
  onTriggerPriceCheckNow,
  onAddRule,
  onDeleteRule,
  onToggleRuleActive,
  onMarkAllRead,
  onInspectDiamond,
  onExportAlertsToSheets,
}) => {
  const [selectedShapes, setSelectedShapes] = useState<DiamondShape[]>(['Round', 'Oval']);
  const [selectedColors, setSelectedColors] = useState<DiamondColor[]>(['D', 'E', 'F']);
  const [minCarat, setMinCarat] = useState(1.0);
  const [maxCarat, setMaxCarat] = useState(2.5);
  const [maxPriceUsd, setMaxPriceUsd] = useState(25000);
  const [ruleLabel, setRuleLabel] = useState('');

  const toggleShape = (s: DiamondShape) => {
    setSelectedShapes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleColor = (c: DiamondColor) => {
    setSelectedColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    const shapesToUse = selectedShapes.length > 0 ? selectedShapes : ALL_SHAPES;
    const colorsToUse = selectedColors.length > 0 ? selectedColors : ALL_COLORS;
    const label =
      ruleLabel.trim() ||
      `${shapesToUse.map((s) => SHAPE_SHORT_RU[s]).join(', ')} · ${minCarat.toFixed(2)}–${maxCarat.toFixed(2)} ct · до $${maxPriceUsd.toLocaleString('en-US')}`;

    onAddRule({
      label,
      shapes: shapesToUse,
      colors: colorsToUse,
      minCarat,
      maxCarat,
      maxPriceUsd,
      active: true,
    });
    setRuleLabel('');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#E4E6EB]">
        <div>
          <h2 className="text-3xl font-semibold text-[#111317]">
            Мгновенные уведомления о снижении цен
          </h2>
          <p className="text-sm text-[#5A606D] mt-1 max-w-2xl">
            Настройте правила мониторинга по камням или характеристикам. При пересмотре
            котировок биржи уведомление появляется мгновенно.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onToggleSound}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#1B365D]" />
                Звук включён
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#6B7280]" />
                Без звука
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleLiveMonitoring}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              liveMonitoring
                ? 'bg-[#EEF2F7] border-[#1B365D] text-[#1B365D]'
                : 'bg-white border-[#D5D9E0] text-[#5A606D] hover:text-[#111317]'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            {liveMonitoring ? 'Автомониторинг активен' : 'Автомониторинг на паузе'}
          </button>

          <button
            type="button"
            onClick={onTriggerPriceCheckNow}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Проверить котировки сейчас
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Create Alert Rule + Active Rules */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleCreateRule}
            className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-[#111317]">
              Новое правило отслеживания цены
            </h3>

            <div>
              <label className="block text-xs text-[#5A606D] mb-1">
                Название правила (необязательно)
              </label>
              <input
                type="text"
                value={ruleLabel}
                onChange={(e) => setRuleLabel(e.target.value)}
                placeholder="Например: Овал 1.5–2 ct на подарок"
                className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
              />
            </div>

            <div>
              <div className="text-xs text-[#5A606D] mb-1.5">Формы</div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SHAPES.map((s) => {
                  const active = selectedShapes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleShape(s)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#1B365D] border-[#1B365D] text-white'
                          : 'bg-white border-[#D5D9E0] text-[#5A606D] hover:text-[#111317]'
                      }`}
                    >
                      {SHAPE_SHORT_RU[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#5A606D] mb-1.5">Цвет</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(
                  new Set([
                    ...ALL_COLORS,
                    ...catalog.map((d) => d.color).filter(Boolean),
                  ])
                ).map((c) => {
                  const active = selectedColors.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleColor(c)}
                      className={`min-w-8 px-2 h-8 text-xs font-mono rounded-md border transition-colors ${
                        active
                          ? 'bg-[#1B365D] border-[#1B365D] text-white font-semibold'
                          : 'bg-white border-[#D5D9E0] text-[#5A606D] hover:text-[#111317]'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-[#5A606D] mb-1">От (ct)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.2"
                  max="10"
                  value={minCarat}
                  onChange={(e) => setMinCarat(Number(e.target.value) || 0.3)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-[#5A606D] mb-1">До (ct)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.3"
                  max="15"
                  value={maxCarat}
                  onChange={(e) => setMaxCarat(Number(e.target.value) || 5.0)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-[#5A606D] mb-1">Макс. ($)</label>
                <input
                  type="number"
                  step="500"
                  min="1000"
                  max="250000"
                  value={maxPriceUsd}
                  onChange={(e) => setMaxPriceUsd(Number(e.target.value) || 20000)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Создать правило мониторинга
            </button>
          </form>

          {/* Active Rules List */}
          <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#111317]">
                Активные подписки ({rules.length})
              </h3>
            </div>

            {rules.length === 0 ? (
              <p className="text-xs text-[#5A606D]">
                Подписок пока нет. Нажмите значок колокольчика на карточке бриллианта или
                создайте правило выше.
              </p>
            ) : (
              <div className="divide-y divide-[#E4E6EB]">
                {rules.map((r) => {
                  const targetStone = r.diamondId
                    ? catalog.find((d) => d.id === r.diamondId)
                    : null;
                  return (
                    <div key={r.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-medium text-[#111317] truncate">
                          {r.label}
                        </div>
                        <div className="text-xs text-[#5A606D] font-mono tabular-nums">
                          {targetStone
                            ? `Камень ${targetStone.sku} · текущая ${formatStonePrice(targetStone.priceUsd, targetStone.currency)}`
                            : `${r.minCarat.toFixed(2)}–${r.maxCarat.toFixed(2)} ct · Цвета ${r.colors.join(', ')} · до $${r.maxPriceUsd.toLocaleString('en-US')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleRuleActive(r.id)}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap ${
                            r.active
                              ? 'bg-[#EEF2F7] border-[#1B365D] text-[#1B365D] font-medium'
                              : 'bg-white border-[#D5D9E0] text-[#5A606D]'
                          }`}
                        >
                          {r.active ? 'Активно' : 'Пауза'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(r.id)}
                          aria-label="Удалить правило"
                          className="p-1.5 rounded text-[#6B7280] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Instant Notifications Feed */}
        <div className="lg:col-span-7 bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E4E6EB]">
            <div>
              <h3 className="text-lg font-semibold text-[#111317]">
                Лента снижений цен ({notifications.length})
              </h3>
              <p className="text-xs text-[#5A606D]">
                Непрочитанных уведомлений: {unreadCount}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Отметить прочитанными
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onExportAlertsToSheets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#1B365D] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Сохранить лог в Sheets
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell className="w-8 h-8 text-[#9CA3AF] mx-auto" />
              <div className="text-sm font-medium text-[#111317]">
                Снижений цен пока не зафиксировано
              </div>
              <p className="text-xs text-[#5A606D]">
                Нажмите «Проверить котировки сейчас», чтобы получить актуальные обновления
                биржевых цен.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E6EB]">
              {notifications.map((n) => {
                const stoneCurrency =
                  catalog.find((d) => d.id === n.diamondId)?.currency || 'USD';
                return (
                <div
                  key={n.id}
                  className={`py-4 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-4 ${
                    !n.read ? 'bg-[#F8FAFC] -mx-3 px-3 rounded-lg' : ''
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-[#0F5132] font-semibold">
                        <TrendingDown className="w-3.5 h-3.5" />
                        −{n.dropPercent}%
                      </span>
                      <span aria-hidden="true" className="text-[#9CA3AF]">
                        ·
                      </span>
                      <span className="font-mono text-[#5A606D]">{n.sku}</span>
                      <span aria-hidden="true" className="text-[#9CA3AF]">
                        ·
                      </span>
                      <span className="text-[#5A606D] font-mono tabular-nums">
                        {new Date(n.timestamp).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-[#111317]">
                      {SHAPE_SHORT_RU[n.shape]} {n.carat.toFixed(2)} ct · {n.color} ·{' '}
                      {n.clarity}
                    </div>

                    <div className="flex items-baseline gap-2 text-xs font-mono tabular-nums">
                      <span className="text-[#6B7280] line-through">
                        {formatStonePrice(n.oldPriceUsd, stoneCurrency)}
                      </span>
                      <span className="text-sm font-semibold text-[#111317]">
                        → {formatStonePrice(n.newPriceUsd, stoneCurrency)}
                      </span>
                      <span className="text-[#0F5132] font-medium">
                        (экономия {formatStonePrice(n.oldPriceUsd - n.newPriceUsd, stoneCurrency)})
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectDiamond(n.diamondId)}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                  >
                    Открыть камень
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
