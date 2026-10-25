import React, { useState } from 'react';
import {
  ShieldAlert,
  Download,
  Upload,
  RotateCcw,
  Check,
  Trash2,
  Save,
  Calculator,
  FolderTree,
  Database,
  Moon,
  Sun,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  User,
  Mail,
  Lock,
  LogOut,
  Pencil,
  AlertCircle,
  Key,
  ShieldCheck,
  RefreshCw,
  Clock,
  Laptop
} from 'lucide-react';
import { UserSettings, BudgetMode, ColorPalette } from '../domain/types';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Avatar } from '../components/ui/Avatar';
import { formatTaka } from '../domain/money';
import { AuthUserProfile } from '../data/firebase';

interface SettingsViewProps {
  settings: UserSettings;
  user?: AuthUserProfile | null;
  onSaveSettings: (settings: UserSettings, message?: string) => void;
  showToast?: (message: string) => void;
  onExportBackup: () => void;
  onOpenImportModal: () => void;
  onReRunOnboarding?: () => void;
  onResetAllData: () => void;
  onUpdateName?: (newName: string) => Promise<void>;
  onSendPasswordReset?: () => Promise<void>;
  onChangePassword?: (currentPass: string, newPass: string) => Promise<void>;
  onResendVerification?: () => Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  onSignOut?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  user,
  onSaveSettings,
  showToast,
  onExportBackup,
  onOpenImportModal,
  onReRunOnboarding,
  onResetAllData,
  onUpdateName,
  onSendPasswordReset,
  onChangePassword,
  onResendVerification,
  onDeleteAccount,
  onSignOut
}) => {
  // Theme & Palette state
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme || 'dark');
  const [colorPalette, setColorPalette] = useState<ColorPalette>(settings.colorPalette || 'green');

  // Budget state
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(settings.budgetMode);
  const [directBudgetStr, setDirectBudgetStr] = useState<string>(String(settings.directDailyBudget || 500));
  const [monthlyIncomeStr, setMonthlyIncomeStr] = useState<string>(String(settings.monthlyIncome || 0));
  const [monthlyFixedStr, setMonthlyFixedStr] = useState<string>(String(settings.monthlyFixed || 0));
  const [monthlySavingsStr, setMonthlySavingsStr] = useState<string>(String(settings.monthlySavings || 0));
  const [monthlyEmergencyStr, setMonthlyEmergencyStr] = useState<string>(String(settings.monthlyEmergency || 0));
  const [bufferPctStr, setBufferPctStr] = useState<string>(String(settings.bufferPct ?? 10));

  // Explainer toggle
  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);

  // Categories & Tags
  const [categories, setCategories] = useState<string[]>([...settings.categories]);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [tags, setTags] = useState<string[]>([...settings.tags]);
  const [newTagInput, setNewTagInput] = useState<string>('');

  // Profile Edit State
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>(user?.displayName || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState<boolean>(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState<boolean>(false);

  // Password Reset Cooldown
  const [resetCooldown, setResetCooldown] = useState<number>(0);
  const [resetSuccess, setResetSuccess] = useState<boolean>(false);

  // Verification Cooldown
  const [verifyCooldown, setVerifyCooldown] = useState<number>(0);
  const [verifySuccess, setVerifySuccess] = useState<boolean>(false);

  // Modals
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState<boolean>(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState<boolean>(false);

  // Status toast
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Computed values for formula explainer
  const numIncome = parseFloat(monthlyIncomeStr) || 0;
  const numFixed = parseFloat(monthlyFixedStr) || 0;
  const numSavings = parseFloat(monthlySavingsStr) || 0;
  const numEmergency = parseFloat(monthlyEmergencyStr) || 0;
  const numBufferPct = Math.min(30, Math.max(0, parseFloat(bufferPctStr) || 0));
  const rawMargin = Math.max(0, numIncome - numFixed - numSavings - numEmergency);
  const bufferAmount = (rawMargin * numBufferPct) / 100;
  const discretionary = Math.max(0, rawMargin - bufferAmount);
  const dailySuggested = discretionary / 30;

  const persistSettings = (patch: Partial<UserSettings>, notificationMessage?: string) => {
    const updated: UserSettings = {
      ...settings,
      theme,
      colorPalette,
      budgetMode,
      directDailyBudget: parseFloat(directBudgetStr) || 0,
      monthlyIncome: parseFloat(monthlyIncomeStr) || 0,
      monthlyFixed: parseFloat(monthlyFixedStr) || 0,
      monthlySavings: parseFloat(monthlySavingsStr) || 0,
      monthlyEmergency: parseFloat(monthlyEmergencyStr) || 0,
      bufferPct: Math.min(100, Math.max(0, parseFloat(bufferPctStr) || 0)),
      categories,
      tags,
      ...patch
    };

    onSaveSettings(updated, notificationMessage);
    if (showToast && notificationMessage) {
      showToast(notificationMessage);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    persistSettings({ theme: newTheme }, `Theme switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode.`);
  };

  const handlePaletteChange = (newPalette: ColorPalette) => {
    setColorPalette(newPalette);
    persistSettings({ colorPalette: newPalette }, `Color palette switched to ${newPalette}.`);
  };

  const handleBudgetModeSelect = (newMode: BudgetMode) => {
    setBudgetMode(newMode);
    const label = newMode === 'calculated' ? 'Smart Formula' : newMode === 'direct' ? 'Direct Target' : 'Off';
    persistSettings({ budgetMode: newMode }, `Budget mode set to ${label}.`);
  };

  const handleDirectBudgetBlur = () => {
    const val = parseFloat(directBudgetStr) || 0;
    persistSettings({ directDailyBudget: val }, `Daily spend cap set to ${formatTaka(val)}/day.`);
  };

  const handleIncomeBlur = () => {
    const val = parseFloat(monthlyIncomeStr) || 0;
    persistSettings({ monthlyIncome: val }, `Monthly income updated to ${formatTaka(val)}.`);
  };

  const handleFixedBlur = () => {
    const val = parseFloat(monthlyFixedStr) || 0;
    persistSettings({ monthlyFixed: val }, `Fixed costs updated to ${formatTaka(val)}.`);
  };

  const handleSavingsBlur = () => {
    const val = parseFloat(monthlySavingsStr) || 0;
    persistSettings({ monthlySavings: val }, `Savings target updated to ${formatTaka(val)}.`);
  };

  const handleEmergencyBlur = () => {
    const val = parseFloat(monthlyEmergencyStr) || 0;
    persistSettings({ monthlyEmergency: val }, `Emergency cushion updated to ${formatTaka(val)}.`);
  };

  const handleBufferChange = (valStr: string) => {
    setBufferPctStr(valStr);
    const val = Math.min(100, Math.max(0, parseFloat(valStr) || 0));
    persistSettings({ bufferPct: val }, `Buffer percentage updated to ${val}%.`);
  };

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (!trimmed) {
      setNameError('Name cannot be blank.');
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      if (onUpdateName) {
        await onUpdateName(trimmed);
      }
      setIsEditingName(false);
    } catch (err: any) {
      setNameError(err?.message || 'Failed to update name.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      if (onChangePassword) {
        await onChangePassword(currentPassword, newPassword);
        setPasswordSuccess('Password successfully changed.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to change password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSendResetLink = async () => {
    if (resetCooldown > 0) return;
    try {
      if (onSendPasswordReset) {
        await onSendPasswordReset();
      }
      setResetSuccess(true);
      setResetCooldown(60);
      const iv = setInterval(() => {
        setResetCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(iv);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      // Don't leak details
    }
  };

  const handleResendVerifyLink = async () => {
    if (verifyCooldown > 0) return;
    try {
      if (onResendVerification) {
        await onResendVerification();
      }
      setVerifySuccess(true);
      setVerifyCooldown(60);
      const iv = setInterval(() => {
        setVerifyCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(iv);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      // Don't leak details
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newCategoryInput.trim();
    if (t && !categories.includes(t)) {
      const updated = [...categories, t];
      setCategories(updated);
      setNewCategoryInput('');
      persistSettings({ categories: updated }, `Category "${t}" added.`);
    }
  };

  const handleRemoveCategory = (cat: string) => {
    const updated = categories.filter((c) => c !== cat);
    setCategories(updated);
    persistSettings({ categories: updated }, `Category "${cat}" removed.`);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTagInput.trim();
    if (t && !tags.includes(t)) {
      const updated = [...tags, t];
      setTags(updated);
      setNewTagInput('');
      persistSettings({ tags: updated }, `Tag "${t}" added.`);
    }
  };

  const handleRemoveTag = (tg: string) => {
    const updated = tags.filter((t) => t !== tg);
    setTags(updated);
    persistSettings({ tags: updated }, `Tag "${tg}" removed.`);
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-12 animate-in fade-in duration-150 max-w-4xl">
      {/* Title & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#E2E2E8] tracking-tight">Account & Application Settings</h2>
          <p className="text-xs text-[#BCCAC1] mt-0.5">
            Manage your personal profile, security, daily budget formula, appearance, and data portability
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#73E3B4] font-medium self-start sm:self-auto shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#73E3B4] animate-pulse" />
          <span>Direct auto-save active</span>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 rounded-xl bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-[#73E3B4] text-xs flex items-center gap-2 shadow-sm animate-in fade-in">
          <Check className="w-4 h-4" />
          <span>Settings updated and synced to your account.</span>
        </div>
      )}

      {/* =========================================================================
          SECTION 0: USER ACCOUNT PROFILE
         ========================================================================= */}
      {user && (
        <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E2E2E8]">Account Profile</h3>
                <p className="text-[11px] text-[#87948C]">
                  Your authenticated identity and tenancy on Google Cloud Firebase
                </p>
              </div>
            </div>

            {onSignOut && (
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(true)}
                className="px-3 py-1.5 rounded-lg bg-[#FFB4AB]/10 hover:bg-[#FFB4AB]/20 text-xs font-semibold text-[#FFB4AB] border border-[#FFB4AB]/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
            {/* Avatar & Display Name */}
            <div className="flex items-center gap-3.5">
              <Avatar photoURL={user.photoURL} name={user.displayName || user.email} size="lg" />

              <div>
                {isEditingName ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="px-2.5 py-1 rounded bg-[#0C0E12] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-semibold outline-none focus:border-[#73E3B4]"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={nameSaving}
                        onClick={handleSaveName}
                        className="px-2.5 py-1 rounded bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] text-xs font-semibold"
                      >
                        {nameSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingName(false);
                          setNameError(null);
                        }}
                        className="px-2 py-1 rounded bg-[#282A2E] text-xs text-[#BCCAC1]"
                      >
                        Cancel
                      </button>
                    </div>
                    {nameError && <div className="text-[11px] text-[#FFB4AB]">{nameError}</div>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[#E2E2E8]">
                      {user.displayName || 'EcO User'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedName(user.displayName || '');
                        setIsEditingName(true);
                      }}
                      className="p-1 rounded text-[#87948C] hover:text-[#73E3B4] hover:bg-[#0C0E12] transition-colors cursor-pointer"
                      title="Edit display name"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="text-xs text-[#87948C] mt-0.5 flex items-center gap-2">
                  <Mail className="w-3 h-3 text-[#87948C]" />
                  <span>{user.email || 'No email attached'}</span>
                </div>
              </div>
            </div>

            {/* Badges: Auth Provider & Verification */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span className="px-2.5 py-1 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-xs text-[#BCCAC1] flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#73E3B4]" />
                <span>{user.providerId === 'google' ? 'Google Account' : 'Email & Password'}</span>
              </span>

              {user.emailVerified ? (
                <span className="px-2.5 py-1 rounded-lg bg-[#73E3B4]/10 border border-[#73E3B4]/40 text-xs text-[#73E3B4] flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendVerifyLink}
                  disabled={verifyCooldown > 0}
                  className="px-2.5 py-1 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/40 text-xs text-[#F59E0B] hover:bg-[#F59E0B]/20 transition-colors font-medium cursor-pointer"
                  title="Send verification email to your inbox"
                >
                  {verifyCooldown > 0 ? `Verify Sent (${verifyCooldown}s)` : 'Verify Email'}
                </button>
              )}
            </div>
          </div>

          {verifySuccess && (
            <div className="p-2.5 rounded-lg bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-xs text-[#73E3B4]">
              Verification link has been dispatched to your email address.
            </div>
          )}

          {/* Account Metadata Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#3D4943]/20 text-[11px] text-[#87948C] font-mono">
            <div>
              Account created: <span className="text-[#E2E2E8]">{user.creationTime ? new Date(user.creationTime).toLocaleDateString() : 'Active session'}</span>
            </div>
            <div className="sm:text-right">
              Last sign in: <span className="text-[#E2E2E8]">{user.lastSignInTime ? new Date(user.lastSignInTime).toLocaleDateString() : 'Just now'}</span>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 1: APPEARANCE & BRAND PALETTE
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
            {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E2E2E8]">Appearance & Theme</h3>
            <p className="text-[11px] text-[#87948C]">
              Switch between Dark OLED Mode and High-Contrast Light Mode
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              theme === 'dark'
                ? 'bg-[#0C0E12] border-[#73E3B4] text-[#73E3B4]'
                : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1A1C20] flex items-center justify-center border border-[#3D4943]/40">
                <Moon className="w-4 h-4 text-[#73E3B4]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#E2E2E8]">Dark Mode</div>
                <div className="text-[11px] text-[#87948C] mt-0.5">Fintech dark slate theme</div>
              </div>
            </div>
            {theme === 'dark' && <span className="w-2 h-2 rounded-full bg-[#73E3B4]" />}
          </button>

          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              theme === 'light'
                ? 'bg-[#0C0E12] border-[#73E3B4] text-[#73E3B4]'
                : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center border border-[#CBD5E1]">
                <Sun className="w-4 h-4 text-[#059669]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#E2E2E8]">Light Mode</div>
                <div className="text-[11px] text-[#87948C] mt-0.5">Crisp, paper-white daylight theme</div>
              </div>
            </div>
            {theme === 'light' && <span className="w-2 h-2 rounded-full bg-[#73E3B4]" />}
          </button>
        </div>

        {/* Brand Color Palette Selector */}
        <div className="pt-3 border-t border-[#3D4943]/30 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#E2E2E8]">Brand Color Palette</span>
              <p className="text-[11px] text-[#87948C]">
                Select primary interface accent. Financial indicators (profit/loss) remain universally green and red.
              </p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#0C0E12] text-[#73E3B4] border border-[#3D4943]/40">
              {colorPalette}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Green Palette (Default) */}
            <button
              type="button"
              onClick={() => handlePaletteChange('green')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                colorPalette === 'green'
                  ? 'bg-[#0C0E12] border-[#73E3B4] text-[#73E3B4]'
                  : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#55C79A] border-2 border-white/20 shadow-sm shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#E2E2E8]">Emerald Green</div>
                  <div className="text-[10px] text-[#87948C]">Default EcO brand</div>
                </div>
              </div>
              {colorPalette === 'green' && <Check className="w-4 h-4 text-[#73E3B4]" />}
            </button>

            {/* Blue Palette */}
            <button
              type="button"
              onClick={() => handlePaletteChange('blue')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                colorPalette === 'blue'
                  ? 'bg-[#0C0E12] border-[#60A5FA] text-[#60A5FA]'
                  : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#3B82F6] border-2 border-white/20 shadow-sm shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#E2E2E8]">Cobalt Blue</div>
                  <div className="text-[10px] text-[#87948C]">Modern fintech blue</div>
                </div>
              </div>
              {colorPalette === 'blue' && <Check className="w-4 h-4 text-[#60A5FA]" />}
            </button>

            {/* Orange Palette */}
            <button
              type="button"
              onClick={() => handlePaletteChange('orange')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                colorPalette === 'orange'
                  ? 'bg-[#0C0E12] border-[#FB923C] text-[#FB923C]'
                  : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#F97316] border-2 border-white/20 shadow-sm shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#E2E2E8]">Amber Orange</div>
                  <div className="text-[10px] text-[#87948C]">Vibrant sunset orange</div>
                </div>
              </div>
              {colorPalette === 'orange' && <Check className="w-4 h-4 text-[#FB923C]" />}
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: BUDGET POLICY & COMMITMENTS
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E2E2E8]">Budget Calculation Method</h3>
            <p className="text-[11px] text-[#87948C]">
              Defines how EcO derives your daily allowance and financial pace
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: 'calculated' as BudgetMode,
                label: 'Smart Formula',
                desc: 'Adaptive daily limit based on monthly plan'
              },
              {
                id: 'direct' as BudgetMode,
                label: 'Direct Target',
                desc: 'Fixed daily spend cap (e.g. ৳500/day)'
              },
              {
                id: 'off' as BudgetMode,
                label: 'Off',
                desc: 'No budget tracking (home card hidden)'
              }
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleBudgetModeSelect(m.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  budgetMode === m.id
                    ? 'bg-[#0C0E12] border-[#73E3B4] text-[#73E3B4] shadow-sm'
                    : 'bg-[#0C0E12]/50 border-[#3D4943]/40 text-[#BCCAC1] hover:border-[#3D4943]/80'
                }`}
              >
                <div className="font-semibold text-xs text-[#E2E2E8]">{m.label}</div>
                <div className="text-[11px] text-[#87948C] mt-1 leading-snug">{m.desc}</div>
              </button>
            ))}
          </div>

          {budgetMode === 'direct' && (
            <div className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 space-y-2">
              <label className="block text-[11px] font-medium text-[#BCCAC1] uppercase tracking-wider">
                Direct Daily Spending Cap (৳)
              </label>
              <div className="flex items-center gap-2 max-w-xs">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={directBudgetStr}
                  onChange={(e) => setDirectBudgetStr(e.target.value)}
                  onBlur={handleDirectBudgetBlur}
                  className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-sm font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                />
                <span className="text-xs text-[#87948C]">৳ / day</span>
              </div>
            </div>
          )}

          {budgetMode === 'calculated' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40">
              {/* Header with optional formula dropdown */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#3D4943]/30">
                <div>
                  <h4 className="text-sm font-bold text-[#E2E2E8]">Smart Budget Formula</h4>
                  <p className="text-[11px] text-[#87948C]">
                    Enter your planned financial targets below. Changes auto-save directly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFormulaDetails(!showFormulaDetails)}
                  className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1.5 cursor-pointer self-start sm:self-auto font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{showFormulaDetails ? 'Hide calculation details' : 'View formula breakdown'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFormulaDetails ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Optional Collapsible Formula Card */}
              {showFormulaDetails && (
                <div className="p-4 rounded-xl bg-[#111317] border border-[#73E3B4]/40 font-mono text-xs space-y-3 animate-in fade-in duration-150">
                  <div className="text-[11px] font-bold text-[#73E3B4] font-sans uppercase tracking-wider">
                    Smart Budget Formula
                  </div>
                  <div className="p-3 rounded-lg bg-[#1A1C20] border border-[#3D4943]/40 text-[#73E3B4] text-xs font-semibold space-y-1">
                    <div>F = max(Planned Fixed, Actual Fixed spent) &nbsp;·&nbsp; E = max(Planned Emergency, Actual Emergency spent)</div>
                    <div>A = (I − F − S − E) × (1 − b/100)</div>
                    <div>Today's Budget = (A − T) ÷ (D − d + 1)</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#BCCAC1]">
                    <div><span className="font-bold text-white font-mono">I</span> &nbsp; Monthly income</div>
                    <div><span className="font-bold text-white font-mono">F</span> &nbsp; Fixed costs — planned, or actual if it runs over</div>
                    <div><span className="font-bold text-white font-mono">S</span> &nbsp; Monthly savings target</div>
                    <div><span className="font-bold text-white font-mono">E</span> &nbsp; Emergency fund — planned, or actual if it runs over</div>
                    <div><span className="font-bold text-white font-mono">b</span> &nbsp; Buffer % (safety margin)</div>
                    <div><span className="font-bold text-white font-mono">T</span> &nbsp; Regular-type spend so far this month only</div>
                    <div><span className="font-bold text-white font-mono">D</span> &nbsp; Days in month</div>
                    <div><span className="font-bold text-white font-mono">d</span> &nbsp; Today's day number</div>
                  </div>
                </div>
              )}

              {/* Input Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                    Monthly Income
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 30000"
                    value={monthlyIncomeStr}
                    onChange={(e) => setMonthlyIncomeStr(e.target.value)}
                    onBlur={handleIncomeBlur}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                    Fixed Monthly Costs
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 12000"
                    value={monthlyFixedStr}
                    onChange={(e) => setMonthlyFixedStr(e.target.value)}
                    onBlur={handleFixedBlur}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                  />
                  <p className="text-[10px] text-[#87948C] mt-1">
                    Pre-set fixed cost does not affect daily budget until actual spending exceeds this value.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                    Monthly Savings Target
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5000"
                    value={monthlySavingsStr}
                    onChange={(e) => setMonthlySavingsStr(e.target.value)}
                    onBlur={handleSavingsBlur}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                    Emergency Fund Contribution
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 2000"
                    value={monthlyEmergencyStr}
                    onChange={(e) => setMonthlyEmergencyStr(e.target.value)}
                    onBlur={handleEmergencyBlur}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                  />
                  <p className="text-[10px] text-[#87948C] mt-1">
                    Pre-set emergency fund does not affect daily budget until actual spending exceeds this value.
                  </p>
                </div>
              </div>

              {/* Buffer Percentage */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#BCCAC1]">
                    Buffer Percentage
                  </label>
                  <span className="text-xs font-mono font-bold text-[#73E3B4] px-2 py-0.5 rounded bg-[#1A1C20] border border-[#3D4943]/40">
                    {bufferPctStr}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={bufferPctStr}
                  onChange={(e) => handleBufferChange(e.target.value)}
                  className="w-full accent-[#73E3B4] cursor-pointer"
                />
              </div>

              {/* Final Computed Output Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 flex flex-col justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
                    Monthly Spendable (A)
                  </span>
                  <div className="mt-2">
                    <div className="text-lg sm:text-xl font-mono font-bold text-[#73E3B4]">
                      {numIncome > 0 ? formatTaka(discretionary) : '৳ —'}
                    </div>
                    <p className="text-[11px] text-[#87948C] mt-0.5">
                      {numIncome > 0 ? 'Planned discretionary spend for month' : 'Fill in your income above to preview.'}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#1A1C20] border border-[#73E3B4]/40 flex flex-col justify-between shadow-sm">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#73E3B4]">
                    Today's Adaptive Budget
                  </span>
                  <div className="mt-2">
                    <div className="text-lg sm:text-xl font-mono font-bold text-[#73E3B4]">
                      {numIncome > 0 ? `${formatTaka(dailySuggested)} / day` : '৳ —'}
                    </div>
                    <p className="text-[11px] text-[#87948C] mt-0.5">
                      {numIncome > 0 ? 'Baseline target daily allowance' : 'Fill in your income above to preview.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: SECURITY & PASSWORD AREA
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E2E2E8]">Security & Credentials</h3>
            <p className="text-[11px] text-[#87948C]">
              Manage password updates and authentication recovery
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-1 text-xs">
          {/* Password Reset Dispatch */}
          <div className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-xs text-[#E2E2E8]">Password Reset Link</div>
              <div className="text-[11px] text-[#87948C] mt-0.5">
                Send a secure password reset link to {user?.email || 'your registered email'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSendResetLink}
              disabled={resetCooldown > 0}
              className="px-3.5 py-2 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] disabled:opacity-50 text-[#73E3B4] border border-[#73E3B4]/40 text-xs font-medium transition-colors cursor-pointer self-start sm:self-auto"
            >
              {resetCooldown > 0 ? `Sent (${resetCooldown}s)` : 'Send Reset Email'}
            </button>
          </div>

          {resetSuccess && (
            <div className="p-2.5 rounded-lg bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-xs text-[#73E3B4]">
              Password reset email has been dispatched.
            </div>
          )}

          {/* Change Password Form for Email users */}
          {user?.providerId === 'email' && (
            <form onSubmit={handleChangePasswordSubmit} className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 space-y-3">
              <div className="font-semibold text-xs text-[#E2E2E8]">Change Your Password</div>

              {passwordError && (
                <div className="p-2.5 rounded-lg bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 text-xs text-[#FFB4AB]">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-2.5 rounded-lg bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-xs text-[#73E3B4]">
                  {passwordSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#BCCAC1] mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#BCCAC1] mb-1">New Password</label>
                  <input
                    type="password"
                    placeholder="Min 6 chars"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#BCCAC1] mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                    required
                  />
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="px-4 py-1.5 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] disabled:opacity-50 text-[#003826] font-semibold text-xs transition-colors cursor-pointer"
                >
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: DATA PORTABILITY & BACKUP
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E2E2E8]">
              Your Data & Portability
            </h3>
            <p className="text-[11px] text-[#87948C]">
              Export, import, or re-run initial setup with duplicate-protected backups
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onExportBackup}
            className="btn-md px-4 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-xs font-medium text-[#73E3B4] border border-[#73E3B4]/40 flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Backup JSON</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="btn-md px-4 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-xs font-medium text-[#BEC7D5] border border-[#3D4943]/50 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import Backup</span>
          </button>

          {onReRunOnboarding && (
            <button
              type="button"
              onClick={onReRunOnboarding}
              className="btn-md px-4 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-xs font-medium text-[#BCCAC1] border border-[#3D4943]/50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Re-run Onboarding Setup</span>
            </button>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: CATEGORIES & TRANSACTION TAGS
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4]">
            <FolderTree className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E2E2E8]">Categories & Tags</h3>
            <p className="text-[11px] text-[#87948C]">
              Customize labels for expenses and transactions
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
              Expense Categories ({categories.length})
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-xs text-[#E2E2E8] flex items-center gap-2"
              >
                <span>{c}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(c)}
                  className="text-[#87948C] hover:text-[#FFB4AB] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={handleAddCategory} className="flex gap-2 pt-1 max-w-sm">
            <input
              type="text"
              placeholder="New category..."
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
            />
            <button
              type="submit"
              disabled={!newCategoryInput.trim()}
              className="btn-sm px-3.5 bg-[#1E2024] hover:bg-[#282A2E] disabled:opacity-40 text-[#73E3B4] border border-[#3D4943]/40 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Add
            </button>
          </form>
        </div>

        {/* Tags */}
        <div className="space-y-2 text-xs pt-4 border-t border-[#3D4943]/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
              Transaction Tags ({tags.length})
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="px-2.5 py-1 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-xs text-[#E2E2E8] flex items-center gap-2"
              >
                <span>{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="text-[#87948C] hover:text-[#FFB4AB] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={handleAddTag} className="flex gap-2 pt-1 max-w-sm">
            <input
              type="text"
              placeholder="New tag..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
            />
            <button
              type="submit"
              disabled={!newTagInput.trim()}
              className="btn-sm px-3.5 bg-[#1E2024] hover:bg-[#282A2E] disabled:opacity-40 text-[#73E3B4] border border-[#3D4943]/40 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Add
            </button>
          </form>
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: DANGER ZONE (RESET DATA & DELETE ACCOUNT)
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#FFB4AB]/30 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FFB4AB] flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4" />
          <span>Danger Zone</span>
        </h3>
        <p className="text-xs text-[#87948C]">
          Carefully manage account destruction or data eradication. These actions permanently erase your cloud records.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="btn-md px-4 rounded-lg bg-[#FFB4AB]/15 hover:bg-[#FFB4AB]/25 text-xs font-semibold text-[#FFB4AB] border border-[#FFB4AB]/40 transition-colors cursor-pointer"
          >
            Reset All Financial Data
          </button>

          {onDeleteAccount && (
            <button
              type="button"
              onClick={() => setShowDeleteAccountConfirm(true)}
              className="btn-md px-4 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-xs font-semibold text-red-400 border border-red-500/50 transition-colors cursor-pointer"
            >
              Delete My Account Permanently
            </button>
          )}
        </div>
      </section>

      {/* Reset Data Confirm Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        isDestructive={true}
        title="Reset All Financial Data"
        message="CRITICAL: Are you sure you want to permanently erase all transactions, accounts, and person ledgers in your account? This action cannot be reversed."
        confirmLabel="Reset All Data"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowResetConfirm(false);
          onResetAllData();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Delete Account Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteAccountConfirm}
        isDestructive={true}
        title="Delete Account & Erase All Data"
        message="DOUBLE CONFIRMATION: Are you sure you want to permanently delete your EcO account and purge all records from Google Cloud Firestore? You will be signed out and your account destroyed."
        confirmLabel="Permanently Delete Account"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowDeleteAccountConfirm(false);
          onDeleteAccount?.();
        }}
        onCancel={() => setShowDeleteAccountConfirm(false)}
      />

      {/* Sign Out Confirm Modal */}
      <ConfirmModal
        isOpen={showSignOutConfirm}
        isDestructive={false}
        title="Sign Out of EcO"
        message="Are you sure you want to sign out? Your cloud data will remain safely preserved in Firebase."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowSignOutConfirm(false);
          onSignOut?.();
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </div>
  );
};
