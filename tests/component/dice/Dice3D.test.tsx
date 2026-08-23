// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dice3D } from '../../../src/components/game/Dice3D';

describe('Dice3D Component Tests', () => {
  it('renders all 6 3D faces', () => {
    render(
      <Dice3D
        value={1}
        isRolling={false}
        activePlayer="p1"
        canRoll={true}
        onRoll={vi.fn()}
      />
    );

    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`dice-face-${i}`)).toBeInTheDocument();
    }
  });

  it('calls onRoll when clicked on active turn', () => {
    const onRoll = vi.fn();
    render(
      <Dice3D
        value={3}
        isRolling={false}
        activePlayer="p1"
        canRoll={true}
        onRoll={onRoll}
      />
    );

    const rollBtn = screen.getByRole('button', { name: /TAP TO ROLL/i });
    fireEvent.click(rollBtn);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onRoll when canRoll is false or isRolling is true', () => {
    const onRoll = vi.fn();
    render(
      <Dice3D
        value={3}
        isRolling={true}
        activePlayer="p1"
        canRoll={false}
        onRoll={onRoll}
      />
    );

    expect(screen.queryByRole('button', { name: /TAP TO ROLL/i })).toBeNull();
    expect(screen.getByText(/Rolling/i)).toBeInTheDocument();
  });

  it('triggers onRoll when direct 3D stage is clicked while canRoll is true', () => {
    const onRoll = vi.fn();
    render(
      <Dice3D
        value={2}
        isRolling={false}
        activePlayer="p1"
        canRoll={true}
        onRoll={onRoll}
      />
    );

    const stage = screen.getByTestId('dice-3d-stage');
    fireEvent.click(stage);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });
});
