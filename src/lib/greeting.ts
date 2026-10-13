/**
 * Dynamic greeting utility for UniFlow dashboard
 * 
 * Schedule:
 * - Good Morning 🌅  — 5:00 AM to 11:59 AM (hours 5..11)
 * - Good Afternoon ☀️ — 12:00 PM to 4:59 PM (hours 12..16)
 * - Good Evening 🌆   — 5:00 PM to 8:59 PM  (hours 17..20)
 * - Good Night 🌙     — 9:00 PM to 4:59 AM  (hours 21..23 or 0..4)
 */

export interface GreetingInfo {
  text: 'Good Morning' | 'Good Afternoon' | 'Good Evening' | 'Good Night';
  emoji: string;
  fullGreeting: string;
}

export function getGreeting(date: Date = new Date()): GreetingInfo {
  const hours = date.getHours();

  if (hours >= 5 && hours < 12) {
    return {
      text: 'Good Morning',
      emoji: '🌅',
      fullGreeting: 'Good Morning 🌅',
    };
  }

  if (hours >= 12 && hours < 17) {
    return {
      text: 'Good Afternoon',
      emoji: '☀️',
      fullGreeting: 'Good Afternoon ☀️',
    };
  }

  if (hours >= 17 && hours < 21) {
    return {
      text: 'Good Evening',
      emoji: '🌆',
      fullGreeting: 'Good Evening 🌆',
    };
  }

  return {
    text: 'Good Night',
    emoji: '🌙',
    fullGreeting: 'Good Night 🌙',
  };
}
