import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';

interface ManagerPasswordGateProps {
  expectedPassword?: string;
  onUnlock: () => void;
  onCancel: () => void;
}

export const ManagerPasswordGate: React.FC<ManagerPasswordGateProps> = ({
  expectedPassword = '0000',
  onUnlock,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === expectedPassword) {
      setError(null);
      setPassword('');
      onUnlock();
      return;
    }
    setError('Неверный пароль. Проверьте код доступа и попробуйте снова.');
  };

  return (
    <section className="max-w-7xl mx-auto px-6 py-16">
      <div className="max-w-md mx-auto bg-white border border-[#E4E6EB] rounded-xl p-8 space-y-6 shadow-[0_12px_32px_rgba(17,19,23,0.05)]">
        <div className="space-y-2 text-center">
          <div className="w-11 h-11 rounded-full bg-[#F1F5F9] border border-[#E4E6EB] text-[#1B365D] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold text-[#111317]">
            Кабинет менеджера
          </h1>
          <p className="text-xs text-[#5A606D] leading-relaxed">
            Доступ к входным ценам, наценкам и загрузке прайс-листов защищён паролем.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="manager-password-input"
              className="block text-xs font-medium text-[#5A606D]"
            >
              Пароль доступа
            </label>
            <div className="relative">
              <input
                id="manager-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                autoComplete="current-password"
                placeholder="Введите пароль"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono tracking-widest bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg focus:outline-none focus:border-[#1B365D]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5A606D] hover:text-[#111317]"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="text-xs text-[#B91C1C]" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
            >
              Войти в кабинет
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full px-4 py-2 text-xs font-medium rounded-lg text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors"
            >
              Вернуться в каталог
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
