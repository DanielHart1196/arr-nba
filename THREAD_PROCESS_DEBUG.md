# Reddit Thread Finding Process Debug

## Current Process Flow

### 1. Game Page Mount
```javascript
// In game/[id]/+page.svelte
const awayName = payload?.linescores?.away?.team?.displayName;  // "New York Knicks"
const homeName = payload?.linescores?.home?.team?.displayName;  // "Philadelphia 76ers"
const pairKey = [normalizeMascot(awayName), normalizeMascot(homeName)].sort().join('|');
// Result: "Knicks|76ers"
```

### 2. Reddit Index Lookup
```javascript
const mapping = await nbaService.getRedditIndex();
const entry = mapping?.[pairKey];  // Looking for mapping["Knicks|76ers"]
let liveThread = entry?.gdt;
let postThread = entry?.pgt;
```

### 3. Reddit Index Parsing
```javascript
// In api/reddit/index/+server.ts
// Parses daily thread index for entries like:
// [Post Game Thread: New York Knicks at Philadelphia 76ers](https://reddit.com/r/nba/comments/1r2i5hi/)

const key = [mascotName(awayPart), mascotName(homePart)].sort().join('|');
// mascotName() function only handles "Trail Blazers" special case
// So: mascotName("New York Knicks") = "New York Knicks"
// Result: "New York Knicks|Philadelphia 76ers"

// But game page creates: "Knicks|76ers"
// MISMATCH! ❌
```

### 4. Thread Storage Keys
```javascript
// Game page stores threads with keys:
globalCache.threads.set(`${pairKey}|new|LIVE`, liveThread);  // "Knicks|76ers|new|LIVE"
globalCache.threads.set(`${pairKey}|top|POST`, postThread);  // "Knicks|76ers|top|POST"

// RedditFeedClient looks for:
const key = `${pairKey()}|${s}|${m}`;  // "Knicks|76ers|new|LIVE" or "Knicks|76ers|top|POST"
```

## THE PROBLEM ❌

### Key Mismatch Issue
1. **Reddit Index creates keys**: `"New York Knicks|Philadelphia 76ers"`
2. **Game page looks for keys**: `"Knicks|76ers"`
3. **Result**: No match found → Falls back to Reddit search

### Reddit Search Query
```javascript
// For post threads:
"POST GAME THREAD" "New York Knicks" "Philadelphia 76ers" -"GAME THREAD"

// This finds threads with exact team names, but Reddit threads often use abbreviations
// Found: "two thirds of the season is over. Over Under stats." (wrong game)
```

## SOLUTION

### Option 1: Fix Key Matching
Make the mascotName function normalize team names:
```javascript
function mascotName(name: string) {
  const n = (name || '').toLowerCase();
  if (n.includes('trail blazers')) return 'Trail Blazers';
  if (n.includes('knicks')) return 'Knicks';
  if (n.includes('76ers')) return '76ers';
  // Add more team name normalizations...
  return name;
}
```

### Option 2: Use Consistent Team Names
Make game page use full team names that match the Reddit index:
```javascript
const awayKey = awayName;  // "New York Knicks"
const homeKey = homeName;  // "Philadelphia 76ers"
const pairKey = [awayKey, homeKey].sort().join('|');
```

## Why Live Threads Work Better

Live threads are more likely to be found because:
1. They're created during the game with standard naming
2. More recent → higher in Reddit search results
3. Game threads often use full team names

Post-game threads are harder because:
1. Created after game → older in search results
2. May use different naming conventions
3. May be buried in the daily index with inconsistent formatting
