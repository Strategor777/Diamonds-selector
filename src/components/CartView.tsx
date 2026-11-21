import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  Send,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import { getStudioFallbackImage } from '../lib/catalogEngine';
import { Diamond, OrderRequest, PriceCurrency } from '../types/diamond';

interface CartViewProps {
  diamonds: Diamond[];
  submittedOrders: OrderRequest[];
  onRemove: (diamondId: string) => void;
  onClearCart: () => void;
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onSubmitOrder: (order: OrderRequest) => void;
  onGoToCatalog: () => void;
}

const CHANNEL_LABELS: Record<OrderRequest['preferredChannel'], string> = {
  phone: 'Телефон',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'E-mail',
};

function formatOrderPlainText(order: OrderRequest): string {
  const dateStr = new Date(order.createdAt).toLocaleString('ru-RU');
  const lines: string[] = [
    `ЗАЯВКА № ${order.requestNumber}`,
    `Дата: ${dateStr}`,
    `Клиент: ${order.customerName}`,
    `Контакт: ${order.contactPhone}`,
  ];
  if (order.contactEmail) {
    lines.push(`E-mail: ${order.contactEmail}`);
  }
  lines.push(`Предпочтительный канал связи: ${CHANNEL_LABELS[order.preferredChannel]}`);
  if (order.comment) {
    lines.push(`Комментарий: ${order.comment}`);
  }
  lines.push('', `Выбранные камни (${order.items.length} шт., общий вес ${order.totalCarat.toFixed(2)} ct):`);

  order.items.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. ${item.sku} | ${SHAPE_SHORT_RU[item.shape]} ${item.carat.toFixed(2)} ct | Цвет: ${item.color} | Чистота: ${item.clarity} | ${item.certLab} #${item.certNumber} | ${formatStonePrice(item.priceUsd, item.currency)}`
    );
  });

  const totals = (Object.entries(order.totalsByCurrency) as [PriceCurrency, number][])
    .filter(([, amount]) => amount > 0)
    .map(([cur, amount]) => formatStonePrice(amount, cur))
    .join(' + ');

  lines.push('', `Итого по заявке: ${totals}`);
  return lines.join('\n');
}

export const CartView: React.FC<CartViewProps> = ({
  diamonds,
  submittedOrders,
  onRemove,
  onClearCart,
  onInspect,
  onSubmitOrder,
  onGoToCatalog,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preferredChannel, setPreferredChannel] =
    useState<OrderRequest['preferredChannel']>('whatsapp');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [latestSubmitted, setLatestSubmitted] = useState<OrderRequest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const summary = useMemo(() => {
    let totalCarat = 0;
    const totalsByCurrency: Partial<Record<PriceCurrency, number>> = {};

    for (const d of diamonds) {
      totalCarat += d.carat;
      const cur: PriceCurrency = d.currency || 'USD';
      totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + d.priceUsd;
    }

    return {
      totalCarat: Number(totalCarat.toFixed(2)),
      totalsByCurrency,
    };
  }, [diamonds]);

  const handleCopyText = async (order: OrderRequest) => {
    const text = formatOrderPlainText(order);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(order.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Fallback copy via temporary textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(order.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const handleDownloadTxt = (order: OrderRequest) => {
    const text = formatOrderPlainText(order);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zayavka-${order.requestNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (diamonds.length === 0) {
      setFormError('Корзина пуста — добавьте хотя бы один камень.');
      return;
    }
    if (!customerName.trim()) {
      setFormError('Укажите имя или контактное лицо.');
      return;
    }
    if (!contactPhone.trim() && !contactEmail.trim()) {
      setFormError('Укажите телефон, мессенджер или e-mail для обратной связи.');
      return;
    }

    const requestNumber = `DS-${new Date().getFullYear()}-${String(
      Math.floor(1000 + Math.random() * 9000)
    )}`;

    const order: OrderRequest = {
      id: `order-${Date.now()}`,
      requestNumber,
      createdAt: new Date().toISOString(),
      customerName: customerName.trim(),
      contactPhone: contactPhone.trim() || contactEmail.trim(),
      contactEmail: contactEmail.trim(),
      preferredChannel,
      comment: comment.trim(),
      items: diamonds.map((d) => ({
        id: d.id,
        sku: d.sku,
        shape: d.shape,
        carat: d.carat,
        color: d.color,
        clarity: d.clarity,
        certLab: d.certLab,
        certNumber: d.certNumber,
        priceUsd: d.priceUsd,
        currency: d.currency || 'USD',
      })),
      totalCarat: summary.totalCarat,
      totalsByCurrency: summary.totalsByCurrency,
    };

    setFormError(null);
    setLatestSubmitted(order);
    onSubmitOrder(order);
    setComment('');
  };

  const renderTotals = (totals: Partial<Record<PriceCurrency, number>>) => {
    const entries = (Object.entries(totals) as [PriceCurrency, number][]).filter(
      ([, amount]) => amount > 0
    );
    if (entries.length === 0) return '$0';
    return entries.map(([cur, amount]) => formatStonePrice(amount, cur)).join(' + ');
  };

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#E4E6EB]">
        <div>
          <h1 className="text-3xl font-semibold text-[#111317]">
            Корзина и оформление заявки
          </h1>
          <p className="text-sm text-[#5A606D] mt-1">
            Сформируйте подборку выбранных бриллиантов и отправьте заявку менеджеру для
            подтверждения наличия, резерва и уточнения условий поставки.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onGoToCatalog}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
          >
            Продолжить подбор
          </button>
          {diamonds.length > 0 && (
            <button
              type="button"
              onClick={onClearCart}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Очистить корзину
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Banner after Submitting an Order */}
      {latestSubmitted && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[#065F46]">
                  Заявка {latestSubmitted.requestNumber} сформирована и отправлена
                </h2>
                <p className="text-xs text-[#047857]">
                  В заявке {latestSubmitted.items.length} камн. общим весом{' '}
                  {latestSubmitted.totalCarat.toFixed(2)} ct на сумму{' '}
                  <strong className="font-mono">
                    {renderTotals(latestSubmitted.totalsByCurrency)}
                  </strong>
                  . Менеджер свяжется с вами через{' '}
                  {CHANNEL_LABELS[latestSubmitted.preferredChannel]} ({latestSubmitted.contactPhone}).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyText(latestSubmitted)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-[#A7F3D0] text-[#065F46] hover:bg-[#F0FDF4] transition-colors whitespace-nowrap"
              >
                {copiedId === latestSubmitted.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Копировать текст
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTxt(latestSubmitted)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-[#A7F3D0] text-[#065F46] hover:bg-[#F0FDF4] transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Скачать (.txt)
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent(
                  `Заявка ${latestSubmitted.requestNumber} — Diamonds Selector`
                )}&body=${encodeURIComponent(formatOrderPlainText(latestSubmitted))}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#065F46] text-white hover:bg-[#044935] transition-colors whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5" />
                Отправить на e-mail
              </a>
            </div>
          </div>
        </div>
      )}

      {diamonds.length === 0 ? (
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#F4F6F9] border border-[#E4E6EB] text-[#1B365D] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-semibold text-[#111317]">
            Ваша корзина пока пуста
          </h2>
          <p className="text-sm text-[#5A606D] leading-relaxed">
            Добавляйте понравившиеся бриллианты кнопкой «В корзину» прямо из каталога,
            чтобы сформировать единую заявку с номерами сертификатов и стоимостью.
          </p>
          <button
            type="button"
            onClick={onGoToCatalog}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
          >
            Перейти в каталог
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Selected Stones List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between text-xs text-[#5A606D]">
              <span>
                Позиций в корзине:{' '}
                <strong className="font-mono text-[#111317]">{diamonds.length}</strong>
              </span>
              <span className="font-mono tabular-nums">
                Общий вес: <strong className="text-[#111317]">{summary.totalCarat.toFixed(2)} ct</strong>
              </span>
            </div>

            <div className="bg-white border border-[#E4E6EB] rounded-xl divide-y divide-[#E4E6EB] overflow-hidden">
              {diamonds.map((diamond) => {
                const pricePerCarat = Math.round(diamond.priceUsd / diamond.carat);
                const isColored =
                  Boolean(diamond.colorFamily) &&
                  diamond.colorFamily !== 'Бесцветный (D–J)';
                const swatch = isColored
                  ? getColorHexTint(diamond.color, diamond.colorFamily).deep
                  : null;

                return (
                  <div
                    key={diamond.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAFAFA] transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <button
                        type="button"
                        onClick={() => onInspect(diamond, 'photo')}
                        className="w-16 h-16 rounded-lg overflow-hidden border border-[#E4E6EB] bg-[#F8F9FB] shrink-0"
                      >
                        <img
                          src={diamond.imageUrl}
                          alt={diamond.sku}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getStudioFallbackImage(diamond);
                            if (e.currentTarget.src !== fallback && !e.currentTarget.dataset.fb) {
                              e.currentTarget.dataset.fb = '1';
                              e.currentTarget.src = fallback;
                            }
                          }}
                          className="w-full h-full object-contain p-1"
                        />
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-mono text-[#5A606D] truncate">
                          {diamond.sku}
                        </div>
                        <button
                          type="button"
                          onClick={() => onInspect(diamond, 'photo')}
                          className="text-base font-semibold text-[#111317] hover:text-[#1B365D] transition-colors text-left block truncate"
                        >
                          {SHAPE_SHORT_RU[diamond.shape]} {diamond.carat.toFixed(2)} ct
                        </button>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5A606D]">
                          <span className="inline-flex items-center gap-1 font-mono text-[#111317]">
                            {swatch && (
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full border border-black/15"
                                style={{ backgroundColor: swatch }}
                              />
                            )}
                            {diamond.color} · {diamond.clarity}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {diamond.lengthMm.toFixed(2)}×{diamond.widthMm.toFixed(2)} мм
                          </span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => onInspect(diamond, 'cert')}
                            className="inline-flex items-center gap-0.5 text-[#1B365D] hover:underline font-medium"
                          >
                            {diamond.certLab} #{diamond.certNumber}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F1F3F5]">
                      <div className="text-left sm:text-right">
                        <div className="text-base font-semibold font-mono tabular-nums text-[#111317]">
                          {formatStonePrice(diamond.priceUsd, diamond.currency)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#5A606D]">
                          {formatStonePrice(pricePerCarat, diamond.currency)}/ct
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(diamond.id)}
                        className="inline-flex items-center gap-1 text-xs text-[#5A606D] hover:text-[#B91C1C] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Order Request Form */}
          <div className="lg:col-span-5 bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
            <div className="pb-4 border-b border-[#E4E6EB] space-y-2">
              <h2 className="text-xl font-semibold text-[#111317]">
                Формирование заявки
              </h2>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-[#5A606D]">
                  Итого ({diamonds.length} камн. · {summary.totalCarat.toFixed(2)} ct):
                </span>
                <span className="text-xl font-semibold font-mono tabular-nums text-[#111317]">
                  {renderTotals(summary.totalsByCurrency)}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="order-customer-name"
                  className="block text-xs font-medium text-[#5A606D]"
                >
                  Ваше имя / Компания *
                </label>
                <input
                  id="order-customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Например, Александр Петров"
                  className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="order-contact-phone"
                  className="block text-xs font-medium text-[#5A606D]"
                >
                  Телефон / Telegram / WhatsApp *
                </label>
                <input
                  id="order-contact-phone"
                  type="text"
                  value={contactPhone}
                  onChange={(e) => {
                    setContactPhone(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="+7 (999) 000-00-00 или @username"
                  className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="order-contact-email"
                  className="block text-xs font-medium text-[#5A606D]"
                >
                  E-mail (для отправки бланка заявки)
                </label>
                <input
                  id="order-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[#5A606D]">
                  Удобный способ связи
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    ['whatsapp', 'telegram', 'phone', 'email'] as OrderRequest['preferredChannel'][]
                  ).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => setPreferredChannel(channel)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        preferredChannel === channel
                          ? 'bg-[#1B365D] border-[#1B365D] text-white'
                          : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                      }`}
                    >
                      {CHANNEL_LABELS[channel]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="order-comment"
                  className="block text-xs font-medium text-[#5A606D]"
                >
                  Комментарий к заявке
                </label>
                <textarea
                  id="order-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Пожелания по срокам, проверке сертификатов, видео или подбору оправы..."
                  className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D] resize-y"
                />
              </div>

              {formError && (
                <p className="text-xs text-[#B91C1C]" role="alert">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
              >
                <Send className="w-4 h-4" />
                Сформировать и отправить заявку
              </button>
            </form>
          </div>
        </div>
      )}

      {/* History of Submitted Requests */}
      {submittedOrders.length > 0 && (
        <div className="pt-4 space-y-4">
          <h2 className="text-xl font-semibold text-[#111317]">
            Отправленные заявки ({submittedOrders.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submittedOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-[#E4E6EB] rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-[#111317]">
                      {order.requestNumber}
                    </div>
                    <div className="text-xs text-[#5A606D]">
                      {new Date(order.createdAt).toLocaleString('ru-RU')} · {order.customerName}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#111317] tabular-nums">
                    {renderTotals(order.totalsByCurrency)}
                  </span>
                </div>

                <div className="text-xs text-[#5A606D] space-y-1">
                  {order.items.slice(0, 4).map((item) => (
                    <div key={item.id} className="truncate font-mono">
                      • {item.sku} — {SHAPE_SHORT_RU[item.shape]} {item.carat.toFixed(2)} ct{' '}
                      {item.color} {item.clarity} ({item.certLab} #{item.certNumber})
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <div className="text-[#5A606D]">
                      … и ещё {order.items.length - 4} поз.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F3F5]">
                  <button
                    type="button"
                    onClick={() => handleCopyText(order)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA] transition-colors"
                  >
                    {copiedId === order.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#059669]" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Скопировать
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTxt(order)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скачать .txt
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
