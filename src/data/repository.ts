import {
  UserSettings,
  PaymentMethod,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PersonRecord,
  PeerTransactionRecord,
  IncomeSource,
  AppNotification,
  EcOConnection,
  EcOProposal,
  IssueReport
} from '../domain/types';
import { createDefaultPaymentMethods } from '../domain/paymentMethods';
import { SEVEN_DAYS_MS } from '../domain/dates';
import { EcoBackupV1, migrateBackupV1ToDomain } from '../domain/backupV1';
import { invertProposalDirection, generateDefaultConnectionCode } from '../domain/connections';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType, sanitizeForFirestore } from './firebase';
import {
  doc,
  collection,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';

export class HybridFirebaseRepository {
  private listeners: Set<() => void> = new Set();
  private unsubs: Unsubscribe[] = [];
  private activeUserId: string | null = null;

  // In-memory user data cache
  private settings: UserSettings | null = null;
  private paymentMethods: PaymentMethod[] = [];
  private expenses: ExpenseRecord[] = [];
  private recurringExpenses: RecurringExpenseRecord[] = [];
  private earnings: EarningRecord[] = [];
  private transfers: TransferRecord[] = [];
  private people: PersonRecord[] = [];
  private transactions: PeerTransactionRecord[] = [];
  private sources: IncomeSource[] = [];
  private notifications: AppNotification[] = [];
  private connections: EcOConnection[] = [];
  private proposals: EcOProposal[] = [];
  private dismissedMilestones: Record<string, string[]> = {};
  private myConnectionCode: string = 'ECO-USER';
  private firstLaunchDone: boolean = false;

  constructor() {
    // Empty initial state
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Repository listener error:', e);
      }
    });
  }

  private getStorageKey(key: string): string {
    const userPrefix = this.activeUserId ? `eco_user_${this.activeUserId}_` : 'eco_local_';
    return `${userPrefix}${key}`;
  }

  private async setDocSafe(docRef: any, data: any, options?: { merge?: boolean }) {
    const sanitized = sanitizeForFirestore(data);
    return options ? setDoc(docRef, sanitized, options) : setDoc(docRef, sanitized);
  }

  /**
   * Initializes data streams for the logged-in user.
   */
  async initForUser(userId: string, userDisplayName?: string, userEmail?: string): Promise<boolean> {
    // Unsubscribe from previous user streams if any
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    this.activeUserId = userId;

    // 1. Load from local cache for instant zero-latency render
    this.loadFromLocalStorageCache();

    // 2. If Firebase is active and configured, subscribe to Firestore real-time subcollections
    if (isFirebaseConfigured() && db) {
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          // New user in Firestore: seed default settings and default wallets
          const initialSettings: UserSettings = {
            id: userId,
            theme: 'dark',
            colorPalette: 'green',
            setupComplete: false,
            budgetMode: 'direct',
            directDailyBudget: 500,
            monthlyIncome: 0,
            monthlyFixed: 0,
            monthlySavings: 0,
            monthlyEmergency: 0,
            bufferPct: 10,
            cashoutChargeRate: 2,
            categories: ['Food', 'Transport', 'Groceries', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'],
            tags: ['Personal', 'Work', 'Family', 'Loan', 'Project'],
            currencySymbol: '৳'
          };

          await this.setDocSafe(userRef, {
            ...initialSettings,
            uid: userId,
            displayName: userDisplayName || 'EcO User',
            email: userEmail || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // Seed default wallets
          const defaultMethods = createDefaultPaymentMethods();
          for (const m of defaultMethods) {
            await this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', m.id), m);
          }

          // Seed default income sources
          const defaultSources: IncomeSource[] = [
            { id: 'src_salary', name: 'Salary', description: 'Primary monthly income', createdAt: new Date().toISOString() },
            { id: 'src_freelance', name: 'Freelance', description: 'Projects and consulting', createdAt: new Date().toISOString() },
            { id: 'src_investment', name: 'Investments', description: 'Dividends and profits', createdAt: new Date().toISOString() }
          ];
          for (const s of defaultSources) {
            await this.setDocSafe(doc(db, 'users', userId, 'sources', s.id), s);
          }

          this.firstLaunchDone = false;
        } else {
          const data = userSnap.data();
          this.firstLaunchDone = Boolean(data?.setupComplete);
        }

        // Attach real-time subcollection listeners
        this.attachFirestoreListeners(userId);
      } catch (err) {
        console.warn('[EcO Firestore] Could not sync user root doc, falling back to local storage:', err);
      }
    }

    this.notify();
    return this.firstLaunchDone;
  }

  /**
   * Cleans up all data and unsubscribes when user logs out.
   */
  clearUserData() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.activeUserId = null;
    this.settings = null;
    this.paymentMethods = [];
    this.expenses = [];
    this.recurringExpenses = [];
    this.earnings = [];
    this.transfers = [];
    this.people = [];
    this.transactions = [];
    this.sources = [];
    this.notifications = [];
    this.connections = [];
    this.proposals = [];
    this.dismissedMilestones = {};
    this.firstLaunchDone = false;
    this.notify();
  }

  private attachFirestoreListeners(userId: string) {
    const firestoreDb = db;
    if (!firestoreDb) return;

    // 1. Settings doc
    const userDocRef = doc(firestoreDb, 'users', userId);
    this.unsubs.push(
      onSnapshot(
        userDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            this.settings = {
              id: userId,
              theme: data.theme || 'dark',
              colorPalette: data.colorPalette || 'green',
              setupComplete: Boolean(data.setupComplete),
              budgetMode: data.budgetMode || 'direct',
              directDailyBudget: data.directDailyBudget ?? 500,
              monthlyIncome: data.monthlyIncome ?? 0,
              monthlyFixed: data.monthlyFixed ?? 0,
              monthlySavings: data.monthlySavings ?? 0,
              monthlyEmergency: data.monthlyEmergency ?? 0,
              bufferPct: data.bufferPct ?? 10,
              cashoutChargeRate: data.cashoutChargeRate ?? 2,
              categories: data.categories || ['Food', 'Transport', 'Utilities'],
              tags: data.tags || ['Personal'],
              currencySymbol: '৳'
            };
            this.firstLaunchDone = Boolean(data.setupComplete);
            this.saveToLocalStorageCache('settings', this.settings);
            this.notify();
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${userId}`)
      )
    );

    // 2. Subcollections helper
    const subcollections = [
      { name: 'paymentMethods', target: 'paymentMethods' },
      { name: 'expenses', target: 'expenses' },
      { name: 'recurringExpenses', target: 'recurringExpenses' },
      { name: 'earnings', target: 'earnings' },
      { name: 'transfers', target: 'transfers' },
      { name: 'people', target: 'people' },
      { name: 'transactions', target: 'transactions' },
      { name: 'sources', target: 'sources' },
      { name: 'notifications', target: 'notifications' }
    ] as const;

    subcollections.forEach(({ name, target }) => {
      const colRef = collection(firestoreDb, 'users', userId, name);
      this.unsubs.push(
        onSnapshot(
          colRef,
          (snapshot) => {
            const items = snapshot.docs.map((d) => d.data()) as any[];
            (this as any)[target] = items;
            this.saveToLocalStorageCache(target, items);
            this.notify();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, `users/${userId}/${name}`)
        )
      );
    });
  }

  private loadFromLocalStorageCache() {
    try {
      const rawSettings = localStorage.getItem(this.getStorageKey('settings'));
      if (rawSettings) {
        this.settings = JSON.parse(rawSettings);
      } else {
        this.settings = {
          id: this.activeUserId || 'main',
          theme: 'dark',
          colorPalette: 'green',
          setupComplete: false,
          budgetMode: 'direct',
          directDailyBudget: 500,
          monthlyIncome: 0,
          monthlyFixed: 0,
          monthlySavings: 0,
          monthlyEmergency: 0,
          bufferPct: 10,
          cashoutChargeRate: 2,
          categories: ['Food', 'Transport', 'Groceries', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'],
          tags: ['Personal', 'Work', 'Family', 'Loan', 'Project'],
          currencySymbol: '৳'
        };
      }

      const rawMethods = localStorage.getItem(this.getStorageKey('paymentMethods'));
      this.paymentMethods = rawMethods ? JSON.parse(rawMethods) : createDefaultPaymentMethods();

      const rawExpenses = localStorage.getItem(this.getStorageKey('expenses'));
      this.expenses = rawExpenses ? JSON.parse(rawExpenses) : [];

      const rawRecurring = localStorage.getItem(this.getStorageKey('recurringExpenses'));
      this.recurringExpenses = rawRecurring ? JSON.parse(rawRecurring) : [];

      const rawEarnings = localStorage.getItem(this.getStorageKey('earnings'));
      this.earnings = rawEarnings ? JSON.parse(rawEarnings) : [];

      const rawTransfers = localStorage.getItem(this.getStorageKey('transfers'));
      this.transfers = rawTransfers ? JSON.parse(rawTransfers) : [];

      const rawPeople = localStorage.getItem(this.getStorageKey('people'));
      this.people = rawPeople ? JSON.parse(rawPeople) : [];

      const rawTransactions = localStorage.getItem(this.getStorageKey('transactions'));
      this.transactions = rawTransactions ? JSON.parse(rawTransactions) : [];

      const rawSources = localStorage.getItem(this.getStorageKey('sources'));
      this.sources = rawSources
        ? JSON.parse(rawSources)
        : [
            { id: 'src_salary', name: 'Salary', description: 'Primary monthly income', createdAt: new Date().toISOString() },
            { id: 'src_freelance', name: 'Freelance', description: 'Projects and consulting', createdAt: new Date().toISOString() },
            { id: 'src_investment', name: 'Investments', description: 'Dividends and profits', createdAt: new Date().toISOString() }
          ];

      const rawNotifications = localStorage.getItem(this.getStorageKey('notifications'));
      this.notifications = rawNotifications ? JSON.parse(rawNotifications) : [];

      const rawSetup = localStorage.getItem(this.getStorageKey('setupComplete'));
      this.firstLaunchDone = rawSetup === 'true';
    } catch (e) {
      console.warn('[EcO Cache] Failed to load local cache:', e);
    }
  }

  private saveToLocalStorageCache(key: string, data: any) {
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(data));
    } catch (e) {
      console.warn('[EcO Cache] Quota exceeded or failed to save to localStorage:', e);
    }
  }

  // --- Getters & Synchronous Accessors ---

  isFirstLaunchDone(): boolean {
    return this.firstLaunchDone;
  }

  async setFirstLaunchDone(val = true): Promise<void> {
    this.firstLaunchDone = val;
    this.saveToLocalStorageCache('setupComplete', val);
    if (this.settings) {
      this.settings.setupComplete = val;
    }

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const userRef = doc(db, 'users', this.activeUserId);
        await this.setDocSafe(userRef, { setupComplete: val, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}`);
      }
    }
    this.notify();
  }

  getSettings(): UserSettings {
    if (!this.settings) {
      return {
        id: this.activeUserId || 'main',
        theme: 'dark',
        colorPalette: 'green',
        setupComplete: this.firstLaunchDone,
        budgetMode: 'direct',
        directDailyBudget: 500,
        monthlyIncome: 0,
        monthlyFixed: 0,
        monthlySavings: 0,
        monthlyEmergency: 0,
        bufferPct: 10,
        cashoutChargeRate: 2,
        categories: ['Food', 'Transport', 'Utilities'],
        tags: ['Personal'],
        currencySymbol: '৳'
      };
    }
    return this.settings;
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    this.settings = settings;
    this.saveToLocalStorageCache('settings', settings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const userRef = doc(db, 'users', this.activeUserId);
        await this.setDocSafe(userRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}`);
      }
    }
    this.notify();
  }

  // --- Payment Methods ---
  getPaymentMethods(): PaymentMethod[] {
    return this.paymentMethods.length > 0 ? this.paymentMethods : createDefaultPaymentMethods();
  }

  async savePaymentMethod(method: PaymentMethod): Promise<void> {
    const list = [...this.paymentMethods];
    const index = list.findIndex((m) => m.id === method.id);
    const updated = {
      ...method,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) {
      list[index] = updated;
    } else {
      list.push(updated);
    }
    this.paymentMethods = list;
    this.saveToLocalStorageCache('paymentMethods', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'paymentMethods', method.id), updated);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${this.activeUserId}/paymentMethods/${method.id}`);
      }
    }
    this.notify();
  }

  async archivePaymentMethod(methodId: string): Promise<void> {
    const item = this.paymentMethods.find((m) => m.id === methodId);
    if (item && !item.isBuiltIn) {
      await this.savePaymentMethod({ ...item, isActive: false });
    }
  }

  // --- Expenses ---
  getExpenses(): ExpenseRecord[] {
    return this.expenses;
  }

  async addExpense(expense: ExpenseRecord): Promise<void> {
    this.expenses = [expense, ...this.expenses];
    this.saveToLocalStorageCache('expenses', this.expenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'expenses', expense.id), expense);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/expenses/${expense.id}`);
      }
    }
    this.notify();
  }

  async deleteExpense(expenseId: string): Promise<void> {
    this.expenses = this.expenses.filter((e) => e.id !== expenseId);
    this.saveToLocalStorageCache('expenses', this.expenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'expenses', expenseId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/expenses/${expenseId}`);
      }
    }
    this.notify();
  }

  // --- Recurring Expenses ---
  getRecurringExpenses(): RecurringExpenseRecord[] {
    return this.recurringExpenses;
  }

  async addRecurringExpense(rec: RecurringExpenseRecord): Promise<void> {
    this.recurringExpenses = [rec, ...this.recurringExpenses];
    this.saveToLocalStorageCache('recurringExpenses', this.recurringExpenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'recurringExpenses', rec.id), rec);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/recurringExpenses/${rec.id}`);
      }
    }
    this.notify();
  }

  async deleteRecurringExpense(id: string): Promise<void> {
    this.recurringExpenses = this.recurringExpenses.filter((r) => r.id !== id);
    this.saveToLocalStorageCache('recurringExpenses', this.recurringExpenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'recurringExpenses', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/recurringExpenses/${id}`);
      }
    }
    this.notify();
  }

  // --- Earnings ---
  getEarnings(): EarningRecord[] {
    return this.earnings;
  }

  async addEarning(earning: EarningRecord): Promise<void> {
    this.earnings = [earning, ...this.earnings];
    this.saveToLocalStorageCache('earnings', this.earnings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'earnings', earning.id), earning);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/earnings/${earning.id}`);
      }
    }
    this.notify();
  }

  async deleteEarning(earningId: string): Promise<void> {
    this.earnings = this.earnings.filter((e) => e.id !== earningId);
    this.saveToLocalStorageCache('earnings', this.earnings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'earnings', earningId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/earnings/${earningId}`);
      }
    }
    this.notify();
  }

  // --- Transfers ---
  getTransfers(): TransferRecord[] {
    return this.transfers;
  }

  async addTransfer(transfer: TransferRecord): Promise<void> {
    this.transfers = [transfer, ...this.transfers];
    this.saveToLocalStorageCache('transfers', this.transfers);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transfers', transfer.id), transfer);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/transfers/${transfer.id}`);
      }
    }
    this.notify();
  }

  async deleteTransfer(transferId: string): Promise<void> {
    this.transfers = this.transfers.filter((t) => t.id !== transferId);
    this.saveToLocalStorageCache('transfers', this.transfers);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'transfers', transferId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/transfers/${transferId}`);
      }
    }
    this.notify();
  }

  // --- People ---
  getPeople(): PersonRecord[] {
    return this.people;
  }

  async addPerson(person: PersonRecord): Promise<void> {
    this.people = [...this.people, person];
    this.saveToLocalStorageCache('people', this.people);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'people', person.id), person);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/people/${person.id}`);
      }
    }
    this.notify();
  }

  async updatePerson(person: PersonRecord): Promise<void> {
    const list = [...this.people];
    const index = list.findIndex((p) => p.id === person.id);
    if (index >= 0) {
      list[index] = person;
      this.people = list;
      this.saveToLocalStorageCache('people', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'people', person.id), person, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/people/${person.id}`);
        }
      }
      this.notify();
    }
  }

  async deletePerson(personId: string): Promise<void> {
    this.people = this.people.filter((p) => p.id !== personId);
    this.saveToLocalStorageCache('people', this.people);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'people', personId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/people/${personId}`);
      }
    }
    this.notify();
  }

  // --- Transactions (Lending & Borrowing) ---
  getTransactions(): PeerTransactionRecord[] {
    return this.transactions;
  }

  async addTransaction(tx: PeerTransactionRecord): Promise<void> {
    this.transactions = [tx, ...this.transactions];
    this.saveToLocalStorageCache('transactions', this.transactions);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transactions', tx.id), tx);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/transactions/${tx.id}`);
      }
    }
    this.notify();
  }

  async deleteTransaction(txId: string): Promise<void> {
    this.transactions = this.transactions.filter((t) => t.id !== txId);
    this.saveToLocalStorageCache('transactions', this.transactions);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'transactions', txId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/transactions/${txId}`);
      }
    }
    this.notify();
  }

  // --- Sources ---
  getSources(): IncomeSource[] {
    return this.sources;
  }

  async addSource(source: IncomeSource): Promise<void> {
    this.sources = [...this.sources, source];
    this.saveToLocalStorageCache('sources', this.sources);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'sources', source.id), source);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/sources/${source.id}`);
      }
    }
    this.notify();
  }

  // --- Notifications ---
  getNotifications(): AppNotification[] {
    const now = Date.now();
    return this.notifications
      .filter((n) => !n.expiresAt || n.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async addNotification(notification: AppNotification): Promise<void> {
    this.notifications = [notification, ...this.notifications];
    this.saveToLocalStorageCache('notifications', this.notifications);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'notifications', notification.id), notification);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/notifications/${notification.id}`);
      }
    }
    this.notify();
  }

  async markNotificationRead(id: string): Promise<void> {
    const list = this.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.notifications = list;
    this.saveToLocalStorageCache('notifications', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'notifications', id), { read: true }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/notifications/${id}`);
      }
    }
    this.notify();
  }

  async markAllNotificationsRead(): Promise<void> {
    const list = this.notifications.map((n) => ({ ...n, read: true }));
    this.notifications = list;
    this.saveToLocalStorageCache('notifications', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const batch = writeBatch(db);
        this.notifications.forEach((n) => {
          batch.update(doc(db!, 'users', this.activeUserId!, 'notifications', n.id), { read: true });
        });
        await batch.commit();
      } catch (err) {
        console.warn('Batch mark read warning:', err);
      }
    }
    this.notify();
  }

  // --- Connections & Milestones ---
  getConnections(): EcOConnection[] {
    return this.connections;
  }

  getProposals(): EcOProposal[] {
    return this.proposals;
  }

  getDismissedMilestones(): Record<string, string[]> {
    return this.dismissedMilestones;
  }

  dismissMilestone(personId: string, milestoneKey: string) {
    const curr = this.dismissedMilestones[personId] || [];
    if (!curr.includes(milestoneKey)) {
      this.dismissedMilestones = {
        ...this.dismissedMilestones,
        [personId]: [...curr, milestoneKey]
      };
      this.saveToLocalStorageCache('dismissedMilestones', this.dismissedMilestones);
      this.notify();
    }
  }

  getMyConnectionCode(): string {
    return this.myConnectionCode;
  }

  saveConnection(conn: EcOConnection): void {
    this.connections = [...this.connections.filter((c) => c.id !== conn.id), conn];
    this.saveToLocalStorageCache('connections', this.connections);
    this.notify();
  }

  deleteConnection(connId: string): void {
    this.connections = this.connections.filter((c) => c.id !== connId);
    this.saveToLocalStorageCache('connections', this.connections);
    this.notify();
  }

  addProposal(proposal: EcOProposal): void {
    this.proposals = [proposal, ...this.proposals];
    this.saveToLocalStorageCache('proposals', this.proposals);
    this.notify();
  }

  acceptProposal(proposalId: string, payMethodId: string): { success: boolean; error?: string } {
    const prop = this.proposals.find((p) => p.id === proposalId);
    if (!prop) return { success: false, error: 'Proposal not found' };

    const newTx: PeerTransactionRecord = {
      id: `tx_${Date.now()}`,
      personId: prop.recipientUserId || 'unknown',
      type: prop.recipientPerspectiveType || 'give',
      amount: prop.amount,
      totalAmount: prop.amount,
      payMethodId: payMethodId,
      tag: 'Debt',
      description: prop.note || `Accepted from ${prop.senderName}`,
      date: prop.date,
      timestamp: Date.now(),
      status: 'accepted'
    };
    this.addTransaction(newTx);

    this.proposals = this.proposals.map((p) =>
      p.id === proposalId ? { ...p, status: 'accepted' as const } : p
    );
    this.saveToLocalStorageCache('proposals', this.proposals);
    this.notify();
    return { success: true };
  }

  rejectProposal(proposalId: string): void {
    this.proposals = this.proposals.map((p) =>
      p.id === proposalId ? { ...p, status: 'rejected' as const } : p
    );
    this.saveToLocalStorageCache('proposals', this.proposals);
    this.notify();
  }

  async saveIssueReport(report: IssueReport): Promise<void> {
    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'issueReports', report.id), report);
      } catch (err) {
        console.warn('Could not post issue report:', err);
      }
    }
  }

  // ============================================================================
  // BACKUP IMPORT & EXPORT (WITH IDEMPOTENCY / DEDUPLICATION)
  // ============================================================================

  exportBackup(): EcoBackupV1 {
    const methods = this.getPaymentMethods();
    const cashMethod = methods.find((m) => m.type === 'cash');
    const bkashMethod = methods.find((m) => m.name.toLowerCase().includes('bkash'));
    const nagadMethod = methods.find((m) => m.name.toLowerCase().includes('nagad'));

    return {
      format: 'eco-backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      app: {
        name: 'EcO',
        purpose: 'Personal Finance & Expense Tracker for Bangladesh'
      },
      timestampEncoding: 'firestore-v1',
      data: {
        settings: [
          {
            id: 'main',
            fields: {
              ...this.getSettings()
            }
          }
        ],
        openingBalances: [
          {
            id: 'current',
            fields: {
              cash: cashMethod?.openingBalance || 0,
              bkash: bkashMethod?.openingBalance || 0,
              nagad: nagadMethod?.openingBalance || 0,
              date: new Date().toISOString().split('T')[0]
            }
          }
        ],
        paymentMethods: methods.map((m) => ({ id: m.id, fields: { ...m } })),
        people: this.people.map((p) => ({ id: p.id, fields: { ...p } })),
        expenses: this.expenses.map((e) => ({ id: e.id, fields: { ...e } })),
        recurringExpenses: this.recurringExpenses.map((r) => ({ id: r.id, fields: { ...r } })),
        earnings: this.earnings.map((ea) => ({ id: ea.id, fields: { ...ea } })),
        transfers: this.transfers.map((t) => ({ id: t.id, fields: { ...t } })),
        transactions: this.transactions.map((tx) => ({ id: tx.id, fields: { ...tx } })),
        sources: this.sources.map((s) => ({ id: s.id, fields: { ...s } }))
      },
      integrity: {
        complete: true,
        counts: {
          settings: 1,
          paymentMethods: methods.length,
          people: this.people.length,
          expenses: this.expenses.length,
          recurringExpenses: this.recurringExpenses.length,
          earnings: this.earnings.length,
          transfers: this.transfers.length,
          transactions: this.transactions.length,
          sources: this.sources.length
        }
      }
    };
  }

  async importBackup(backup: EcoBackupV1): Promise<{ importedCount: number; skippedCount: number }> {
    const domainData = migrateBackupV1ToDomain(backup);
    let importedCount = 0;
    let skippedCount = 0;

    // Deduplication Set of existing IDs
    const existingExpenseIds = new Set(this.expenses.map((e) => e.id));
    const existingEarningIds = new Set(this.earnings.map((e) => e.id));
    const existingTransferIds = new Set(this.transfers.map((t) => t.id));
    const existingPersonIds = new Set(this.people.map((p) => p.id));
    const existingTxIds = new Set(this.transactions.map((t) => t.id));

    // 1. Settings
    if (domainData.settings) {
      await this.saveSettings(domainData.settings);
    }

    // 2. Methods
    for (const m of domainData.paymentMethods) {
      await this.savePaymentMethod(m);
    }

    // 3. People (Deduplicate)
    for (const p of domainData.people) {
      if (!existingPersonIds.has(p.id)) {
        await this.addPerson(p);
        existingPersonIds.add(p.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 4. Expenses (Deduplicate)
    for (const exp of domainData.expenses) {
      if (!existingExpenseIds.has(exp.id)) {
        await this.addExpense(exp);
        existingExpenseIds.add(exp.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 5. Earnings (Deduplicate)
    for (const earn of domainData.earnings) {
      if (!existingEarningIds.has(earn.id)) {
        await this.addEarning(earn);
        existingEarningIds.add(earn.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 6. Transfers (Deduplicate)
    for (const tr of domainData.transfers) {
      if (!existingTransferIds.has(tr.id)) {
        await this.addTransfer(tr);
        existingTransferIds.add(tr.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 7. Transactions (Deduplicate)
    for (const tx of domainData.transactions) {
      if (!existingTxIds.has(tx.id)) {
        await this.addTransaction(tx);
        existingTxIds.add(tx.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    await this.setFirstLaunchDone(true);
    return { importedCount, skippedCount };
  }

  /**
   * Resets all user financial data in Firestore and local cache.
   */
  async resetAllUserData(): Promise<void> {
    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const collectionsToClean = [
          'expenses',
          'recurringExpenses',
          'earnings',
          'transfers',
          'people',
          'transactions',
          'sources',
          'notifications'
        ];
        for (const colName of collectionsToClean) {
          const snap = await getDocs(collection(db, 'users', this.activeUserId, colName));
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }

        // Reset user root doc
        await this.setDocSafe(doc(db, 'users', this.activeUserId), {
          setupComplete: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn('Firestore reset warning:', err);
      }
    }

    // Clear local lists
    this.expenses = [];
    this.recurringExpenses = [];
    this.earnings = [];
    this.transfers = [];
    this.people = [];
    this.transactions = [];
    this.notifications = [];
    this.paymentMethods = createDefaultPaymentMethods();
    this.firstLaunchDone = false;

    // Reset local cache keys
    const keys = [
      'expenses',
      'recurringExpenses',
      'earnings',
      'transfers',
      'people',
      'transactions',
      'notifications',
      'setupComplete'
    ];
    keys.forEach((k) => localStorage.removeItem(this.getStorageKey(k)));
    this.saveToLocalStorageCache('paymentMethods', this.paymentMethods);

    this.notify();
  }

  /**
   * Alias for resetting all data.
   */
  async resetAllData(): Promise<void> {
    await this.resetAllUserData();
  }

  /**
   * Alias for importBackup to maintain backwards compatibility.
   */
  async importLegacyBackup(data: any): Promise<void> {
    await this.importBackup(data);
  }

  /**
   * Alias for exportBackup to maintain backwards compatibility.
   */
  exportBackupV1(): EcoBackupV1 {
    return this.exportBackup();
  }
}

export const repository = new HybridFirebaseRepository();
