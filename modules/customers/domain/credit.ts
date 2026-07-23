export interface CreditCheckInput {
  creditLimit: number | null | undefined;
  outstandingBalance: number;
  proposedOrderTotal: number;
}

/** A customer with no configured credit limit is treated as unrestricted (doc 11 gives no default). */
export function isWithinCreditLimit(input: CreditCheckInput): boolean {
  if (input.creditLimit == null) return true;
  return input.outstandingBalance + input.proposedOrderTotal <= input.creditLimit;
}
