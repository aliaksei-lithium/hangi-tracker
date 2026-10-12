/** Time-of-day greeting for the home screen: "Good evening, Aliaksei". */
export function greeting(displayName: string, now: Date = new Date()): string {
  const h = now.getHours();
  const part = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'evening';
  return `Good ${part}, ${displayName}`;
}
