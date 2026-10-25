/**
 * EcO-to-EcO Two-User Connection & Proposal Inversion Logic
 */

import { EcOConnection, EcOProposal, TransactionType } from './types';

/**
 * Inverts the transaction direction for the recipient.
 * If User A 'give' (User A lent money, expects to receive):
 * User B's ledger perspective MUST be 'take' (User B received/borrowed money, owes User A).
 *
 * If User A 'take' (User A borrowed money, owes User B):
 * User B's ledger perspective MUST be 'give' (User B lent money, expects to receive).
 */
export function invertProposalDirection(senderDirection: TransactionType): TransactionType {
  return senderDirection === 'give' ? 'take' : 'give';
}

/**
 * Formats user input into standard EcO Connection Code format (e.g. ECO-4A92K7)
 */
export function formatConnectionCode(input: string): string {
  if (!input) return '';
  let cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.startsWith('ECO')) {
    cleaned = cleaned.substring(3);
  }
  return cleaned ? `ECO-${cleaned}` : '';
}

/**
 * Validates connection code format.
 * Format: ECO-XXXX or user handle (at least 4 alphanumerics).
 */
export function validateConnectionCode(code: string): boolean {
  if (!code) return false;
  const cleaned = code.trim().toUpperCase();
  return /^ECO-[A-Z0-9]{4,12}$/.test(cleaned) || /^[A-Z0-9-]{4,16}$/.test(cleaned);
}

/**
 * Generates a stable deterministic 6-character connection code for this user/device.
 */
export function generateDefaultConnectionCode(seed = ''): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (!seed) {
    let randCode = '';
    for (let i = 0; i < 6; i++) {
      randCode += chars[Math.floor(Math.random() * chars.length)];
    }
    return `ECO-${randCode}`;
  }

  // Deterministic 6-character uppercase alphanumeric hash
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 37) ^ c;
  }
  let combined = Math.abs(h1) * 100000 + Math.abs(h2);
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars[combined % chars.length];
    combined = Math.floor(combined / chars.length) + (seed.charCodeAt(i % seed.length) || 11);
  }
  return `ECO-${res}`;
}

