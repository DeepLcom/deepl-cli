export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
