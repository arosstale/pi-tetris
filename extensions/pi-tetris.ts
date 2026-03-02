/**
 * Tetris extension - play Tetris with /tetris command
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TICK_MS = 500;
const FAST_TICK_MS = 50;

// Tetromino shapes (each rotation state)
const PIECES: Record<string, number[][][]> = {
	I: [
		[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
		[[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
		[[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
		[[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
	],
	O: [
		[[1, 1], [1, 1]],
	],
	T: [
		[[0, 1, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 1, 0]],
		[[0, 1, 0], [1, 1, 0], [0, 1, 0]],
	],
	S: [
		[[0, 1, 1], [1, 1, 0], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 0, 1]],
		[[0, 0, 0], [0, 1, 1], [1, 1, 0]],
		[[1, 0, 0], [1, 1, 0], [0, 1, 0]],
	],
	Z: [
		[[1, 1, 0], [0, 1, 1], [0, 0, 0]],
		[[0, 0, 1], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 0], [0, 1, 1]],
		[[0, 1, 0], [1, 1, 0], [1, 0, 0]],
	],
	J: [
		[[1, 0, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 1], [0, 1, 0], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 0, 1]],
		[[0, 1, 0], [0, 1, 0], [1, 1, 0]],
	],
	L: [
		[[0, 0, 1], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 0], [0, 1, 1]],
		[[0, 0, 0], [1, 1, 1], [1, 0, 0]],
		[[1, 1, 0], [0, 1, 0], [0, 1, 0]],
	],
};

const PIECE_NAMES = Object.keys(PIECES);

const PIECE_COLORS: Record<string, string> = {
	I: "\x1b[36m",  // Cyan
	O: "\x1b[33m",  // Yellow
	T: "\x1b[35m",  // Magenta
	S: "\x1b[32m",  // Green
	Z: "\x1b[31m",  // Red
	J: "\x1b[34m",  // Blue
	L: "\x1b[38;5;208m", // Orange
};

const RESET = "\x1b[0m";

interface Piece {
	type: string;
	rotation: number;
	x: number;
	y: number;
}

interface GameState {
	board: (string | null)[][]; // null = empty, string = piece type color
	current: Piece;
	next: string;
	score: number;
	lines: number;
	level: number;
	gameOver: boolean;
	highScore: number;
}

function randomPiece(): string {
	return PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
}

function getShape(piece: Piece): number[][] {
	const rotations = PIECES[piece.type];
	return rotations[piece.rotation % rotations.length];
}

function createBoard(): (string | null)[][] {
	return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
}

function createInitialState(): GameState {
	const type = randomPiece();
	return {
		board: createBoard(),
		current: {
			type,
			rotation: 0,
			x: Math.floor(BOARD_WIDTH / 2) - 1,
			y: 0,
		},
		next: randomPiece(),
		score: 0,
		lines: 0,
		level: 1,
		gameOver: false,
		highScore: 0,
	};
}

function collides(board: (string | null)[][], piece: Piece): boolean {
	const shape = getShape(piece);
	for (let row = 0; row < shape.length; row++) {
		for (let col = 0; col < shape[row].length; col++) {
			if (shape[row][col]) {
				const boardX = piece.x + col;
				const boardY = piece.y + row;
				if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) return true;
				if (boardY >= 0 && board[boardY][boardX] !== null) return true;
			}
		}
	}
	return false;
}

function lockPiece(board: (string | null)[][], piece: Piece): void {
	const shape = getShape(piece);
	for (let row = 0; row < shape.length; row++) {
		for (let col = 0; col < shape[row].length; col++) {
			if (shape[row][col]) {
				const boardX = piece.x + col;
				const boardY = piece.y + row;
				if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
					board[boardY][boardX] = piece.type;
				}
			}
		}
	}
}

function clearLines(state: GameState): number {
	let cleared = 0;
	for (let row = BOARD_HEIGHT - 1; row >= 0; row--) {
		if (state.board[row].every((cell) => cell !== null)) {
			state.board.splice(row, 1);
			state.board.unshift(Array(BOARD_WIDTH).fill(null));
			cleared++;
			row++; // re-check this row
		}
	}
	return cleared;
}

// Scoring: 1=100, 2=300, 3=500, 4=800
const LINE_SCORES = [0, 100, 300, 500, 800];

class TetrisComponent {
	private state: GameState;
	private interval: ReturnType<typeof setInterval> | null = null;
	private onClose: () => void;
	private onSave: (state: GameState | null) => void;
	private tui: { requestRender: () => void };
	private cachedLines: string[] = [];
	private cachedWidth = 0;
	private version = 0;
	private cachedVersion = -1;
	private paused: boolean;
	private softDrop = false;

	constructor(
		tui: { requestRender: () => void },
		onClose: () => void,
		onSave: (state: GameState | null) => void,
		savedState?: GameState,
	) {
		this.tui = tui;
		this.onClose = onClose;
		this.onSave = onSave;

		if (savedState && !savedState.gameOver) {
			this.state = savedState;
			this.paused = true;
		} else {
			this.state = createInitialState();
			if (savedState) {
				this.state.highScore = savedState.highScore;
			}
			this.paused = false;
			this.startGame();
		}
	}

	private getTickSpeed(): number {
		if (this.softDrop) return FAST_TICK_MS;
		// Speed up with level
		return Math.max(100, TICK_MS - (this.state.level - 1) * 40);
	}

	private startGame(): void {
		this.scheduleNext();
	}

	private scheduleNext(): void {
		if (this.interval) clearTimeout(this.interval);
		this.interval = setTimeout(() => {
			if (!this.state.gameOver && !this.paused) {
				this.tick();
				this.version++;
				this.tui.requestRender();
				this.scheduleNext();
			}
		}, this.getTickSpeed());
	}

	private tick(): void {
		// Try to move piece down
		const moved: Piece = { ...this.state.current, y: this.state.current.y + 1 };
		if (!collides(this.state.board, moved)) {
			this.state.current = moved;
			if (this.softDrop) this.state.score += 1; // soft drop bonus
		} else {
			// Lock piece
			lockPiece(this.state.board, this.state.current);

			// Clear lines
			const cleared = clearLines(this.state);
			if (cleared > 0) {
				this.state.lines += cleared;
				this.state.score += (LINE_SCORES[cleared] || 0) * this.state.level;
				this.state.level = Math.floor(this.state.lines / 10) + 1;
			}

			if (this.state.score > this.state.highScore) {
				this.state.highScore = this.state.score;
			}

			// Spawn new piece
			this.state.current = {
				type: this.state.next,
				rotation: 0,
				x: Math.floor(BOARD_WIDTH / 2) - 1,
				y: 0,
			};
			this.state.next = randomPiece();
			this.softDrop = false;

			// Check game over
			if (collides(this.state.board, this.state.current)) {
				this.state.gameOver = true;
			}
		}
	}

	private hardDrop(): void {
		while (!collides(this.state.board, { ...this.state.current, y: this.state.current.y + 1 })) {
			this.state.current.y++;
			this.state.score += 2; // hard drop bonus
		}
		// Force immediate lock
		this.tick();
		this.version++;
		this.tui.requestRender();
		this.scheduleNext();
	}

	handleInput(data: string): void {
		if (this.paused && !this.state.gameOver) {
			if (matchesKey(data, "escape") || data === "q" || data === "Q") {
				this.dispose();
				this.onClose();
				return;
			}
			// Any other key resumes
			this.paused = false;
			this.startGame();
			this.version++;
			this.tui.requestRender();
			return;
		}

		// ESC to pause and save
		if (matchesKey(data, "escape")) {
			this.paused = true;
			this.dispose();
			this.onSave(this.state);
			this.onClose();
			return;
		}

		// Q to quit without saving
		if (data === "q" || data === "Q") {
			this.dispose();
			this.onSave(null);
			this.onClose();
			return;
		}

		if (this.state.gameOver) {
			if (data === "r" || data === "R" || data === " ") {
				const highScore = this.state.highScore;
				this.state = createInitialState();
				this.state.highScore = highScore;
				this.onSave(null);
				this.startGame();
				this.version++;
				this.tui.requestRender();
			}
			return;
		}

		// Movement
		if (matchesKey(data, "left") || data === "a" || data === "A") {
			const moved: Piece = { ...this.state.current, x: this.state.current.x - 1 };
			if (!collides(this.state.board, moved)) {
				this.state.current = moved;
				this.version++;
				this.tui.requestRender();
			}
		} else if (matchesKey(data, "right") || data === "d" || data === "D") {
			const moved: Piece = { ...this.state.current, x: this.state.current.x + 1 };
			if (!collides(this.state.board, moved)) {
				this.state.current = moved;
				this.version++;
				this.tui.requestRender();
			}
		} else if (matchesKey(data, "down") || data === "s" || data === "S") {
			// Soft drop
			this.softDrop = true;
			this.scheduleNext(); // Reset timer with faster speed
		} else if (matchesKey(data, "up") || data === "w" || data === "W") {
			// Rotate
			const rotated: Piece = {
				...this.state.current,
				rotation: (this.state.current.rotation + 1) % (PIECES[this.state.current.type].length),
			};
			if (!collides(this.state.board, rotated)) {
				this.state.current = rotated;
				this.version++;
				this.tui.requestRender();
			} else {
				// Wall kick: try shifting left/right
				for (const offset of [-1, 1, -2, 2]) {
					const kicked: Piece = { ...rotated, x: rotated.x + offset };
					if (!collides(this.state.board, kicked)) {
						this.state.current = kicked;
						this.version++;
						this.tui.requestRender();
						break;
					}
				}
			}
		} else if (data === " ") {
			// Hard drop
			this.hardDrop();
		}
	}

	invalidate(): void {
		this.cachedWidth = 0;
	}

	render(width: number): string[] {
		if (width === this.cachedWidth && this.cachedVersion === this.version) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const cellWidth = 2;
		const boardPixelWidth = BOARD_WIDTH * cellWidth;

		const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
		const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
		const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
		const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
		const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
		const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

		const boxLine = (content: string, boxWidth: number): string => {
			const contentLen = visibleWidth(content);
			const padding = Math.max(0, boxWidth - contentLen);
			return dim(" │") + content + " ".repeat(padding) + dim("│");
		};

		// Build a composite board with the current piece overlaid
		const display: (string | null)[][] = this.state.board.map((row) => [...row]);

		// Ghost piece (preview where piece will land)
		const ghost: Piece = { ...this.state.current };
		while (!collides(this.state.board, { ...ghost, y: ghost.y + 1 })) {
			ghost.y++;
		}

		// Draw ghost
		if (!this.state.gameOver) {
			const ghostShape = getShape(ghost);
			for (let row = 0; row < ghostShape.length; row++) {
				for (let col = 0; col < ghostShape[row].length; col++) {
					if (ghostShape[row][col]) {
						const bx = ghost.x + col;
						const by = ghost.y + row;
						if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH && display[by][bx] === null) {
							display[by][bx] = "ghost";
						}
					}
				}
			}
		}

		// Draw current piece on top
		if (!this.state.gameOver) {
			const shape = getShape(this.state.current);
			for (let row = 0; row < shape.length; row++) {
				for (let col = 0; col < shape[row].length; col++) {
					if (shape[row][col]) {
						const bx = this.state.current.x + col;
						const by = this.state.current.y + row;
						if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
							display[by][bx] = this.state.current.type;
						}
					}
				}
			}
		}

		// Side panel width
		const sideWidth = 14;
		const totalBoxWidth = boardPixelWidth + 1 + sideWidth; // 1 for separator

		// Top border
		lines.push(this.padLine(dim(` ╭${"─".repeat(totalBoxWidth)}╮`), width));

		// Title
		const title = `${bold(cyan("TETRIS"))} │ Level ${bold(yellow(String(this.state.level)))}`;
		lines.push(this.padLine(boxLine(title, totalBoxWidth), width));

		// Separator
		lines.push(this.padLine(dim(` ├${"─".repeat(boardPixelWidth)}┬${"─".repeat(sideWidth)}┤`), width));

		// Render board rows alongside side panel
		for (let y = 0; y < BOARD_HEIGHT; y++) {
			let rowStr = "";
			for (let x = 0; x < BOARD_WIDTH; x++) {
				const cell = display[y][x];
				if (cell === null) {
					rowStr += dim("· ");
				} else if (cell === "ghost") {
					rowStr += dim("░░");
				} else {
					const color = PIECE_COLORS[cell] || "";
					rowStr += `${color}██${RESET}`;
				}
			}

			// Side panel content
			let sideContent = "";
			if (y === 0) {
				sideContent = ` ${bold("NEXT")}`;
			} else if (y >= 1 && y <= 4) {
				// Render next piece preview
				const nextRotations = PIECES[this.state.next];
				const nextShape = nextRotations[0];
				const previewRow = y - 1;
				let preview = " ";
				if (previewRow < nextShape.length) {
					for (let col = 0; col < nextShape[previewRow].length; col++) {
						if (nextShape[previewRow][col]) {
							const color = PIECE_COLORS[this.state.next] || "";
							preview += `${color}██${RESET}`;
						} else {
							preview += "  ";
						}
					}
				}
				sideContent = preview;
			} else if (y === 6) {
				sideContent = ` ${bold("SCORE")}`;
			} else if (y === 7) {
				sideContent = ` ${yellow(String(this.state.score))}`;
			} else if (y === 9) {
				sideContent = ` ${bold("LINES")}`;
			} else if (y === 10) {
				sideContent = ` ${green(String(this.state.lines))}`;
			} else if (y === 12) {
				sideContent = ` ${bold("HIGH")}`;
			} else if (y === 13) {
				sideContent = ` ${yellow(String(this.state.highScore))}`;
			}

			const sideVisible = visibleWidth(sideContent);
			const sidePad = Math.max(0, sideWidth - sideVisible);
			const line = dim(" │") + rowStr + dim("│") + sideContent + " ".repeat(sidePad) + dim("│");
			lines.push(this.padLine(line, width));
		}

		// Bottom separator
		lines.push(this.padLine(dim(` ├${"─".repeat(boardPixelWidth)}┴${"─".repeat(sideWidth)}┤`), width));

		// Footer
		let footer: string;
		if (this.paused) {
			footer = `${yellow(bold("PAUSED"))} Press any key to resume, ${bold("Q")} to quit`;
		} else if (this.state.gameOver) {
			footer = `${red(bold("GAME OVER!"))} Press ${bold("R")} to restart, ${bold("Q")} to quit`;
		} else {
			footer = `←→ move  ↑ rotate  ↓ soft  ${bold("SPACE")} drop  ${bold("ESC")} pause`;
		}
		lines.push(this.padLine(boxLine(footer, totalBoxWidth), width));

		// Bottom border
		lines.push(this.padLine(dim(` ╰${"─".repeat(totalBoxWidth)}╯`), width));

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;

		return lines;
	}

	private padLine(line: string, width: number): string {
		const padding = Math.max(0, width - visibleWidth(line));
		return line + " ".repeat(padding);
	}

	dispose(): void {
		if (this.interval) {
			clearTimeout(this.interval);
			this.interval = null;
		}
	}
}

const TETRIS_SAVE_TYPE = "tetris-save";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tetris", {
		description: "Play Tetris!",

		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Tetris requires interactive mode", "error");
				return;
			}

			// Load saved state from session
			const entries = ctx.sessionManager.getEntries();
			let savedState: GameState | undefined;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				if (entry.type === "custom" && entry.customType === TETRIS_SAVE_TYPE) {
					savedState = entry.data as GameState;
					break;
				}
			}

			await ctx.ui.custom((tui, _theme, _kb, done) => {
				return new TetrisComponent(
					tui,
					() => done(undefined),
					(state) => {
						pi.appendEntry(TETRIS_SAVE_TYPE, state);
					},
					savedState,
				);
			});
		},
	});
}
