import { describe, it, expect } from 'vitest';
import {
  getTileCoordinates,
  getTileCenterPercent,
  calculateStepSequence,
  getLadderLinePoint,
  getSnakeCurvePoint,
  generateBoardRows,
  SNAKES,
  LADDERS,
} from '../../../src/config/boardConfig';

describe('Board Configuration and Coordinate Engine', () => {
  describe('getTileCoordinates (10x10 Boustrophedon Grid)', () => {
    it('correctly maps Row 0 (Tiles 1 to 10: Left-to-Right)', () => {
      expect(getTileCoordinates(1)).toEqual({ col: 0, row: 0 });
      expect(getTileCoordinates(5)).toEqual({ col: 4, row: 0 });
      expect(getTileCoordinates(10)).toEqual({ col: 9, row: 0 });
    });

    it('correctly maps Row 1 (Tiles 11 to 20: Right-to-Left)', () => {
      expect(getTileCoordinates(11)).toEqual({ col: 9, row: 1 });
      expect(getTileCoordinates(15)).toEqual({ col: 5, row: 1 });
      expect(getTileCoordinates(20)).toEqual({ col: 0, row: 1 });
    });

    it('correctly maps Row 2 (Tiles 21 to 30: Left-to-Right)', () => {
      expect(getTileCoordinates(21)).toEqual({ col: 0, row: 2 });
      expect(getTileCoordinates(30)).toEqual({ col: 9, row: 2 });
    });

    it('correctly maps Row 9 (Tiles 91 to 100: Right-to-Left)', () => {
      expect(getTileCoordinates(91)).toEqual({ col: 9, row: 9 });
      expect(getTileCoordinates(95)).toEqual({ col: 5, row: 9 });
      expect(getTileCoordinates(100)).toEqual({ col: 0, row: 9 });
    });
  });

  describe('getTileCenterPercent (SVG/HTML Percentage Coordinates)', () => {
    it('positions Tile 1 at bottom-left center (5%, 95%)', () => {
      expect(getTileCenterPercent(1)).toEqual({ x: 5, y: 95 });
    });

    it('positions Tile 10 at bottom-right center (95%, 95%)', () => {
      expect(getTileCenterPercent(10)).toEqual({ x: 95, y: 95 });
    });

    it('positions Tile 11 at row above Tile 10 (95%, 85%)', () => {
      expect(getTileCenterPercent(11)).toEqual({ x: 95, y: 85 });
    });

    it('positions Tile 20 at row above Tile 1 (5%, 85%)', () => {
      expect(getTileCenterPercent(20)).toEqual({ x: 5, y: 85 });
    });

    it('positions Tile 100 at top-left center (5%, 5%)', () => {
      expect(getTileCenterPercent(100)).toEqual({ x: 5, y: 5 });
    });

    it('positions Tile 91 at top-right center (95%, 5%)', () => {
      expect(getTileCenterPercent(91)).toEqual({ x: 95, y: 5 });
    });
  });

  describe('calculateStepSequence (Countable Step-by-Step Traversal)', () => {
    it('generates sequential square-by-square advancement for normal roll', () => {
      // 23 rolled 4 -> 24 -> 25 -> 26 -> 27
      expect(calculateStepSequence(23, 4)).toEqual([24, 25, 26, 27]);
    });

    it('generates sequential square-by-square advancement from start tile', () => {
      // 1 rolled 5 -> 2 -> 3 -> 4 -> 5 -> 6
      expect(calculateStepSequence(1, 5)).toEqual([2, 3, 4, 5, 6]);
    });

    it('generates exact sequence when landing exactly on tile 100', () => {
      // 97 rolled 3 -> 98 -> 99 -> 100
      expect(calculateStepSequence(97, 3)).toEqual([98, 99, 100]);
    });

    it('implements bounce-back rule when overshooting tile 100', () => {
      // 98 rolled 4 -> 99 -> 100 -> 99 -> 98
      expect(calculateStepSequence(98, 4)).toEqual([99, 100, 99, 98]);
    });

    it('handles bounce-back with large roll', () => {
      // 96 rolled 6 -> 97 -> 98 -> 99 -> 100 -> 99 -> 98
      expect(calculateStepSequence(96, 6)).toEqual([97, 98, 99, 100, 99, 98]);
    });

    it('returns empty array if steps <= 0', () => {
      expect(calculateStepSequence(10, 0)).toEqual([]);
      expect(calculateStepSequence(10, -2)).toEqual([]);
    });
  });

  describe('Entity Path Evaluators', () => {
    it('evaluates ladder linear points from bottom to top', () => {
      const ladder = LADDERS[0]; // e.g. bottom: 6, top: 27
      const start = getLadderLinePoint(ladder, 0);
      const end = getLadderLinePoint(ladder, 1);
      const mid = getLadderLinePoint(ladder, 0.5);

      expect(start).toEqual(getTileCenterPercent(ladder.bottom));
      expect(end).toEqual(getTileCenterPercent(ladder.top));
      expect(mid.x).toBeCloseTo((start.x + end.x) / 2);
      expect(mid.y).toBeCloseTo((start.y + end.y) / 2);
    });

    it('evaluates snake bezier points from head to tail', () => {
      const snake = SNAKES[0]; // e.g. head: 95, tail: 75
      const head = getSnakeCurvePoint(snake, 0);
      const tail = getSnakeCurvePoint(snake, 1);

      expect(head.x).toBeCloseTo(getTileCenterPercent(snake.head).x);
      expect(head.y).toBeCloseTo(getTileCenterPercent(snake.head).y);
      expect(tail.x).toBeCloseTo(getTileCenterPercent(snake.tail).x);
      expect(tail.y).toBeCloseTo(getTileCenterPercent(snake.tail).y);
    });
  });

  describe('generateBoardRows', () => {
    it('generates 10 rows of 10 numbers each', () => {
      const matrix = generateBoardRows();
      expect(matrix).toHaveLength(10);
      matrix.forEach((row) => expect(row).toHaveLength(10));

      // Row 0 (top): 100, 99, ..., 91
      expect(matrix[0][0]).toBe(100);
      expect(matrix[0][9]).toBe(91);

      // Row 9 (bottom): 1, 2, ..., 10
      expect(matrix[9][0]).toBe(1);
      expect(matrix[9][9]).toBe(10);
    });
  });
});
