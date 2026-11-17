import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  LogOut,
  PlusCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { SHAPE_SHORT_RU } from '../data/diamonds';
import {
  SpreadsheetMeta,
  alertsToSheetRows,
  createDiamondSpreadsheet,
  diamondsToSheetRows,
  fetchSpreadsheetMeta,
  readDiamondsFromSheet,
  updateSheetValues,
} from '../lib/googleSheets';
import { Diamond, PriceDropNotification, PricingConfig } from '../types/diamond';
import { GoogleSignInButton } from './GoogleSignInButton';

interface PendingWriteConfirmation {
  mode: 'create' | 'update';
  spreadsheetId?: string;
  spreadsheetTitle: string;
  sheetTitle: string;
  datasetLabel: string;
  rows: string[][];
}

interface GoogleSheetsWorkspaceProps {
  user: User | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  catalog: Diamond[];
  comparedDiamonds: Diamond[];
  notifications: PriceDropNotification[];
  pricingConfig: PricingConfig;
  customExportBatch: { stones: Diamond[]; label: string } | null;
  onClearCustomBatch: () => void;
  onImportDiamonds: (diamonds: Diamond[], replaceExisting: boolean) => void;
}

export const GoogleSheetsWorkspace: React.FC<GoogleSheetsWorkspaceProps> = ({
  user,
  accessToken,
  isLoggingIn,
  onLogin,
  onLogout,
  catalog,
  comparedDiamonds,
  notifications,
  pricingConfig,
  customExportBatch,
  onClearCustomBatch,
  onImportDiamonds,
}) => {
  const [sheetUrlOrId, setSheetUrlOrId] = useState('');
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [selectedTab, setSelectedTab] = useState('');
  const [previewDiamonds, setPreviewDiamonds] = useState<Diamond[] | null>(null);
  const [replaceCatalog, setReplaceCatalog] = useState(false);

  const [exportDataset, setExportDataset] = useState<
    'catalog' | 'compare' | 'alerts' | 'custom'
  >(customExportBatch ? 'custom' : 'catalog');
  const [exportTargetMode, setExportTargetMode] = useState<'new' | 'existing'>('new');
  const [newSheetTitle, setNewSheetTitle] = useState(
    `Diamonds Selector — Каталог (${new Date().toISOString().slice(0, 10)})`
  );
  const [newTabTitle, setNewTabTitle] = useState('Diamonds');

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    url?: string;
  } | null>(null);

  const [pendingConfirm, setPendingConfirm] =
    useState<PendingWriteConfirmation | null>(null);

  React.useEffect(() => {
    if (customExportBatch) {
      setExportDataset('custom');
      setNewSheetTitle(`Diamonds Selector — ${customExportBatch.label}`);
    }
  }, [customExportBatch]);

  const handleLoadMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setErrorMsg(null);
    setSuccessInfo(null);
    setPreviewDiamonds(null);
    setLoadingAction('meta');
    try {
      const loaded = await fetchSpreadsheetMeta(accessToken, sheetUrlOrId);
      setMeta(loaded);
      if (loaded.sheets.length > 0) {
        setSelectedTab(loaded.sheets[0].title);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка при загрузке Google Таблицы.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePreviewRead = async () => {
    if (!accessToken || !meta || !selectedTab) return;
    setErrorMsg(null);
    setSuccessInfo(null);
    setLoadingAction('read');
    try {
      const { diamonds } = await readDiamondsFromSheet(
        accessToken,
        meta.spreadsheetId,
        selectedTab,
        pricingConfig
      );
      if (diamonds.length === 0) {
        setErrorMsg(
          `На вкладке «${selectedTab}» не найдено строк с данными. Убедитесь, что в первой строке указаны заголовки (Shape, Carat, Color, Clarity, Price).`
        );
        setPreviewDiamonds(null);
      } else {
        setPreviewDiamonds(diamonds);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Не удалось прочитать вкладку.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApplyImport = () => {
    if (!previewDiamonds || previewDiamonds.length === 0) return;
    onImportDiamonds(previewDiamonds, replaceCatalog);
    setSuccessInfo({
      message: `Импортировано ${previewDiamonds.length} бриллиантов из листа «${selectedTab}» в каталог приложения.`,
    });
    setPreviewDiamonds(null);
  };

  const buildSelectedRows = (): { rows: string[][]; label: string } => {
    if (exportDataset === 'custom' && customExportBatch) {
      return {
        rows: diamondsToSheetRows(customExportBatch.stones),
        label: `${customExportBatch.label} (${customExportBatch.stones.length} камней)`,
      };
    }
    if (exportDataset === 'compare') {
      return {
        rows: diamondsToSheetRows(comparedDiamonds),
        label: `Сравнение камней (${comparedDiamonds.length} шт.)`,
      };
    }
    if (exportDataset === 'alerts') {
      return {
        rows: alertsToSheetRows(notifications),
        label: `Лог снижений цен (${notifications.length} событий)`,
      };
    }
    return {
      rows: diamondsToSheetRows(catalog),
      label: `Полный каталог (${catalog.length} камней)`,
    };
  };

  const handleRequestExport = () => {
    setErrorMsg(null);
    setSuccessInfo(null);
    const { rows, label } = buildSelectedRows();

    if (rows.length <= 1) {
      setErrorMsg('Выбранный набор данных пуст — нечего записывать в Google Таблицы.');
      return;
    }

    if (exportTargetMode === 'existing') {
      if (!meta || !selectedTab) {
        setErrorMsg(
          'Сначала загрузите существующую таблицу по ссылке или ID в левой панели, чтобы выбрать вкладку.'
        );
        return;
      }
      setPendingConfirm({
        mode: 'update',
        spreadsheetId: meta.spreadsheetId,
        spreadsheetTitle: meta.title,
        sheetTitle: selectedTab,
        datasetLabel: label,
        rows,
      });
    } else {
      setPendingConfirm({
        mode: 'create',
        spreadsheetTitle: newSheetTitle.trim() || 'Diamonds Selector Export',
        sheetTitle: newTabTitle.trim() || 'Diamonds',
        datasetLabel: label,
        rows,
      });
    }
  };

  const handleConfirmWrite = async () => {
    if (!pendingConfirm || !accessToken) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    setLoadingAction('write');
    setErrorMsg(null);

    try {
      if (action.mode === 'create') {
        const created = await createDiamondSpreadsheet(
          accessToken,
          action.spreadsheetTitle,
          action.sheetTitle,
          action.rows
        );
        setSuccessInfo({
          message: `Создана таблица «${action.spreadsheetTitle}» и записано ${action.rows.length - 1} строк.`,
          url: created.spreadsheetUrl,
        });
      } else if (action.spreadsheetId) {
        await updateSheetValues(
          accessToken,
          action.spreadsheetId,
          action.sheetTitle,
          action.rows
        );
        setSuccessInfo({
          message: `Вкладка «${action.sheetTitle}» таблицы «${action.spreadsheetTitle}» обновлена (${action.rows.length - 1} строк).`,
          url: `https://docs.google.com/spreadsheets/d/${action.spreadsheetId}/edit`,
        });
      }
      if (exportDataset === 'custom') {
        onClearCustomBatch();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка при записи данных в Google Sheets.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E4E6EB]">
        <div>
          <h2 className="text-3xl font-semibold text-[#111317]">
            Интеграция с Google Таблицами
          </h2>
          <p className="text-sm text-[#5A606D] mt-1 max-w-2xl">
            Импортируйте инвентарь бриллиантов из вашей Google Таблицы (с расчётом
            клиентской цены из входной) или сохраняйте подборки сравнения и пары
            напрямую в Google Sheets.
          </p>
        </div>

        {user && accessToken ? (
          <div className="flex items-center gap-3 bg-white border border-[#E4E6EB] rounded-lg px-4 py-2">
            <div className="text-xs">
              <div className="font-medium text-[#111317]">
                {user.displayName || user.email}
              </div>
              <div className="text-[#0F5132]">Google Sheets подключён</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-[#D5D9E0] text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Выйти
            </button>
          </div>
        ) : null}
      </div>

      {/* Unauthenticated Gate */}
      {!accessToken ? (
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-10 text-center max-w-xl mx-auto space-y-5">
          <FileSpreadsheet className="w-10 h-10 text-[#1B365D] mx-auto" />
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-[#111317]">
              Подключите аккаунт Google для работы с таблицами
            </h3>
            <p className="text-sm text-[#5A606D] leading-relaxed">
              Авторизация выполняется напрямую через ваш аккаунт Google. Токен доступа
              хранится только в оперативной памяти текущей сессии.
            </p>
          </div>
          <div className="flex justify-center pt-1">
            <GoogleSignInButton
              onClick={onLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Подключение...' : 'Войти с Google'}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Alerts / Notifications */}
          {errorMsg && (
            <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#065F46] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successInfo.message}</span>
              </div>
              {successInfo.url && (
                <a
                  href={successInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-[#A7F3D0] text-[#065F46] hover:bg-[#F0FDF4] transition-colors"
                >
                  Открыть в Google Таблицах
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Panel 1: Import from Google Sheets */}
            <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <Download className="w-5 h-5 text-[#1B365D]" />
                <h3 className="text-xl font-semibold text-[#111317]">
                  Импорт каталога из таблицы
                </h3>
              </div>

              <form onSubmit={handleLoadMeta} className="space-y-3">
                <label
                  htmlFor="gs-url-input"
                  className="block text-xs font-medium text-[#5A606D]"
                >
                  Ссылка на Google Таблицу или её ID
                </label>
                <div className="flex gap-2">
                  <input
                    id="gs-url-input"
                    type="text"
                    value={sheetUrlOrId}
                    onChange={(e) => setSheetUrlOrId(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loadingAction === 'meta'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {loadingAction === 'meta' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    Загрузить листы
                  </button>
                </div>
                <p className="text-xs text-[#5A606D]">
                  Поддерживаются колонки: <span className="font-mono">SKU, Shape/Форма, Carat/Карат, Color/Цвет, Clarity/Чистота, Price/Цена, Cert_Lab, Cert_Number, Cert_URL, Photo, Video</span>.
                </p>
              </form>

              {meta && (
                <div className="p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-[#5A606D]">Подключённая таблица</div>
                      <div className="text-sm font-semibold text-[#111317]">
                        {meta.title}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-[#5A606D]">
                      Листов: {meta.sheets.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="gs-tab-select"
                      className="block text-xs font-medium text-[#5A606D]"
                    >
                      Выберите вкладку (лист)
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="gs-tab-select"
                        value={selectedTab}
                        onChange={(e) => setSelectedTab(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-[#D5D9E0] rounded-lg"
                      >
                        {meta.sheets.map((s) => (
                          <option key={s.sheetId} value={s.title}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handlePreviewRead}
                        disabled={loadingAction === 'read'}
                        className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                      >
                        {loadingAction === 'read' ? 'Чтение...' : 'Прочитать строки'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {previewDiamonds && (
                <div className="border border-[#E4E6EB] rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#111317]">
                      Распознано камней: {previewDiamonds.length}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-[#5A606D] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceCatalog}
                        onChange={(e) => setReplaceCatalog(e.target.checked)}
                        className="accent-[#1B365D]"
                      />
                      Заменить текущий каталог
                    </label>
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-[#E4E6EB] text-xs">
                    {previewDiamonds.slice(0, 6).map((d) => (
                      <div key={d.id} className="py-2 flex items-center justify-between gap-2">
                        <span className="font-medium text-[#111317]">
                          {d.sku} · {SHAPE_SHORT_RU[d.shape]} {d.carat.toFixed(2)} ct · {d.color}/{d.clarity}
                        </span>
                        <span className="font-mono tabular-nums text-[#5A606D]">
                          ${d.priceUsd.toLocaleString('en-US')}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyImport}
                    className="w-full py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
                  >
                    Добавить в каталог ({previewDiamonds.length} камней)
                  </button>
                </div>
              )}
            </div>

            {/* Panel 2: Export / Sync to Google Sheets */}
            <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-[#1B365D]" />
                <h3 className="text-xl font-semibold text-[#111317]">
                  Экспорт и обновление в Google Таблицах
                </h3>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-[#5A606D]">
                  Какие данные записать
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customExportBatch && (
                    <button
                      type="button"
                      onClick={() => setExportDataset('custom')}
                      className={`p-3 text-left rounded-lg border transition-colors ${
                        exportDataset === 'custom'
                          ? 'border-[#1B365D] bg-[#F8FAFC]'
                          : 'border-[#E4E6EB] hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#111317]">
                        {customExportBatch.label}
                      </div>
                      <div className="text-xs text-[#5A606D] font-mono tabular-nums mt-0.5">
                        {customExportBatch.stones.length} камней
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setExportDataset('catalog')}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      exportDataset === 'catalog'
                        ? 'border-[#1B365D] bg-[#F8FAFC]'
                        : 'border-[#E4E6EB] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#111317]">
                      Весь текущий каталог
                    </div>
                    <div className="text-xs text-[#5A606D] font-mono tabular-nums mt-0.5">
                      {catalog.length} камней
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportDataset('compare')}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      exportDataset === 'compare'
                        ? 'border-[#1B365D] bg-[#F8FAFC]'
                        : 'border-[#E4E6EB] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#111317]">
                      Список сравнения
                    </div>
                    <div className="text-xs text-[#5A606D] font-mono tabular-nums mt-0.5">
                      {comparedDiamonds.length} камней
                    </div>
                  </button>

                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-[#E4E6EB]">
                <label className="block text-xs font-medium text-[#5A606D]">
                  Куда сохранить
                </label>
                <div className="inline-flex items-center gap-1 p-1 bg-[#EAECEF] rounded-lg w-full">
                  <button
                    type="button"
                    onClick={() => setExportTargetMode('new')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      exportTargetMode === 'new'
                        ? 'bg-white text-[#111317] shadow-sm'
                        : 'text-[#5A606D]'
                    }`}
                  >
                    Создать новую таблицу
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportTargetMode('existing')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      exportTargetMode === 'existing'
                        ? 'bg-white text-[#111317] shadow-sm'
                        : 'text-[#5A606D]'
                    }`}
                  >
                    Обновить открытый лист
                  </button>
                </div>

                {exportTargetMode === 'new' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-[#5A606D] mb-1">
                        Название таблицы
                      </label>
                      <input
                        type="text"
                        value={newSheetTitle}
                        onChange={(e) => setNewSheetTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#5A606D] mb-1">
                        Имя вкладки
                      </label>
                      <input
                        type="text"
                        value={newTabTitle}
                        onChange={(e) => setNewTabTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg text-xs text-[#5A606D]">
                    {meta && selectedTab ? (
                      <span>
                        Данные будут записаны во вкладку{' '}
                        <strong className="text-[#111317]">«{selectedTab}»</strong>{' '}
                        таблицы{' '}
                        <strong className="text-[#111317]">«{meta.title}»</strong>.
                      </span>
                    ) : (
                      <span>
                        Сначала загрузите таблицу по ссылке или ID в блоке слева, чтобы
                        выбрать вкладку для обновления.
                      </span>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleRequestExport}
                  disabled={loadingAction === 'write'}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-60 transition-colors"
                >
                  {loadingAction === 'write' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4" />
                  )}
                  {exportTargetMode === 'new'
                    ? 'Создать таблицу в Google Sheets'
                    : 'Записать данные в выбранную вкладку'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mandatory User Confirmation Dialog before ANY Google Sheets Mutation */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение записи в Google Таблицы"
        >
          <div className="bg-white border border-[#E4E6EB] rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#1B365D]">
                Подтверждение изменения данных в Google Sheets
              </div>
              <h3 className="text-xl font-semibold text-[#111317]">
                {pendingConfirm.mode === 'create'
                  ? `Создать таблицу «${pendingConfirm.spreadsheetTitle}»?`
                  : `Обновить вкладку «${pendingConfirm.sheetTitle}»?`}
              </h3>
              <p className="text-sm text-[#5A606D] leading-relaxed">
                {pendingConfirm.mode === 'create'
                  ? `В вашем Google Аккаунте будет создана новая таблица с листом «${pendingConfirm.sheetTitle}».`
                  : `Содержимое диапазона начиная с A1 на вкладке «${pendingConfirm.sheetTitle}» в таблице «${pendingConfirm.spreadsheetTitle}» будет перезаписано.`}
              </p>
            </div>

            <div className="p-3.5 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg text-xs space-y-1">
              <div>
                <span className="text-[#5A606D]">Набор данных: </span>
                <span className="font-medium text-[#111317]">
                  {pendingConfirm.datasetLabel}
                </span>
              </div>
              <div>
                <span className="text-[#5A606D]">Строк к записи: </span>
                <span className="font-mono tabular-nums font-medium text-[#111317]">
                  {pendingConfirm.rows.length} (включая заголовки)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmWrite}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
              >
                Подтвердить запись
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
