// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SnakeOverlay } from '../../../src/components/game/SnakeOverlay';
import { LadderOverlay } from '../../../src/components/game/LadderOverlay';
import { BoardGrid } from '../../../src/components/game/BoardGrid';
import { SNAKES, LADDERS } from '../../../src/config/boardConfig';
import { getTileCenterPercent } from '../../../src/config/boardConfig';

describe('Snakes & Ladders board artwork', () => {
  it('renders each snake as a custom filled silhouette with a sculpted head', () => {
    const { container } = render(<SnakeOverlay activeSnakeId={SNAKES[0].id} />);
    const snakes = container.querySelectorAll('[data-snake-id]');

    expect(snakes).toHaveLength(SNAKES.length);
    expect(container.querySelectorAll('[data-snake-body]')).toHaveLength(SNAKES.length);
    expect(container.querySelectorAll('[data-snake-belly]')).toHaveLength(SNAKES.length);
    expect(container.querySelectorAll('[data-snake-route]')).toHaveLength(SNAKES.length);
    expect(container.querySelectorAll('[data-snake-pattern-clip]')).toHaveLength(SNAKES.length);
    expect(container.querySelectorAll('[data-snake-head]')).toHaveLength(SNAKES.length);
    expect(container.querySelector('[data-snake-id="snake-95-75"]')).toHaveClass('snake-illustration-active');

    container.querySelectorAll('[data-snake-body]').forEach((body) => {
      expect(body.getAttribute('fill')).not.toBe('none');
      expect(body.getAttribute('d')).toMatch(/Z$/);
    });
  });

  it('clips body markings inside each silhouette and anchors routes to rule tiles', () => {
    const { container } = render(<SnakeOverlay />);
    const snakes = container.querySelectorAll('[data-snake-id]');

    expect(container.querySelectorAll('[data-snake-spot]')).toHaveLength(SNAKES.length * 7);
    snakes.forEach((snakeGroup, index) => {
      const snake = SNAKES[index];
      const route = snakeGroup.querySelector('[data-snake-route]');
      const path = route?.getAttribute('d') ?? '';
      const points = path.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+C.*?\s+([\d.-]+)\s+([\d.-]+)$/);

      expect(points).not.toBeNull();
      expect(points?.slice(1).map(Number)).toEqual([
        getTileCenterPercent(snake.head).x,
        getTileCenterPercent(snake.head).y,
        getTileCenterPercent(snake.tail).x,
        getTileCenterPercent(snake.tail).y,
      ]);
    });
  });

  it('routes the two lower snakes through separate visual lanes', () => {
    const { container } = render(<SnakeOverlay />);
    const midpoint = (snakeId: string) => {
      const path = container.querySelector(`[data-snake-id="${snakeId}"] [data-snake-route]`)?.getAttribute('d') ?? '';
      const values = path.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)$/);
      expect(values).not.toBeNull();
      const [x0, y0, x1, y1, x2, y2, x3, y3] = values!.slice(1).map(Number);
      const t = 0.5;
      const point = (start: number, control1: number, control2: number, end: number) =>
        (1 - t) ** 3 * start + 3 * (1 - t) ** 2 * t * control1 + 3 * (1 - t) * t ** 2 * control2 + t ** 3 * end;

      return { x: point(x0, x1, x2, x3), y: point(y0, y1, y2, y3) };
    };
    const redMidpoint = midpoint('snake-36-14');
    const greenMidpoint = midpoint('snake-48-26');

    expect(Math.hypot(redMidpoint.x - greenMidpoint.x, redMidpoint.y - greenMidpoint.y)).toBeGreaterThan(15);
  });

  it('renders sturdy ladders with paired rails, shaped ends, and visible rungs', () => {
    const { container } = render(<LadderOverlay activeLadderId={LADDERS[0].id} />);
    const ladders = container.querySelectorAll('[data-ladder-id]');

    expect(ladders).toHaveLength(LADDERS.length);
    expect(container.querySelectorAll('[data-ladder-rail]')).toHaveLength(LADDERS.length * 2);
    expect(container.querySelectorAll('[data-ladder-rung]').length).toBeGreaterThanOrEqual(LADDERS.length * 4);
    expect(container.querySelectorAll('[data-ladder-cap]')).toHaveLength(LADDERS.length * 4);
    expect(container.querySelectorAll('[data-ladder-binding]').length).toBeGreaterThanOrEqual(LADDERS.length * 6);
    expect(container.querySelector('[data-ladder-id="ladder-6-27"]')).toHaveClass('ladder-illustration-active');
  });

  it('keeps all tile labels above the decorative artwork on the adventure board', () => {
    const { container } = render(
      <BoardGrid p1Position={1} p2Position={1} activePlayer="p1" />
    );

    expect(container.querySelectorAll('.board-tile-label')).toHaveLength(100);
    expect(container.querySelector('.board-tile-label')).toHaveClass('z-20');
    expect(container.textContent).not.toMatch(/[▲▼](UP|DN)/);
    expect(container.querySelector('.snakes-ladders-board-frame')?.className).toContain('max-w-[min(94vw,540px)]');
    expect(container.querySelector('.snakes-ladders-board-frame')).toHaveClass('rounded-none');
    expect(container.querySelector('.snakes-ladders-board-canvas')).toHaveClass('rounded-none');
  });
});
