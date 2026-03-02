# pi-tetris 🎮

Play Tetris inside [pi](https://shittycodingagent.ai)!

![Tetris in your terminal](https://raw.githubusercontent.com/nicobailon/pi-tetris/main/screenshot.png)

## Install

```bash
pi install npm:pi-tetris
```

Or from git:

```bash
pi install https://github.com/nicobailon/pi-tetris
```

## Play

```
/tetris
```

## Controls

| Key | Action |
|-----|--------|
| `←` `→` or `A` `D` | Move left/right |
| `↑` or `W` | Rotate |
| `↓` or `S` | Soft drop |
| `SPACE` | Hard drop |
| `ESC` | Pause & save |
| `Q` | Quit |
| `R` | Restart (after game over) |

## Features

- All 7 classic tetrominoes (I, O, T, S, Z, J, L) with proper colors
- Ghost piece showing where the piece will land
- Next piece preview
- Wall kicks for rotation near edges
- Score, lines cleared, level tracking
- Speed increases with level
- High score tracking per session
- Game state saves on pause and restores on `/tetris`
- Soft drop and hard drop with score bonuses

## Scoring

| Lines | Points (× level) |
|-------|-------------------|
| 1 | 100 |
| 2 | 300 |
| 3 | 500 |
| 4 (Tetris!) | 800 |

Soft drop: +1 per row. Hard drop: +2 per row.
