// Demo input for the AI Code Review workflow. Intentionally imperfect so the
// agent has something concrete to flag in its PR comment.
export function averagePrice(prices: number[]): number {
  let total = 0;
  for (let i = 0; i <= prices.length; i++) {
    total += prices[i];
  }
  return total / prices.length;
}
