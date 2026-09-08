// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VSIntroOverlay } from '../../../src/components/duel/VSIntroOverlay';

describe('VSIntroOverlay Component Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render matchup player names, game type, and countdown to completion', () => {
    const onComplete = vi.fn();

    render(
      <VSIntroOverlay
        gameType="snake"
        stake={100}
        pot={200}
        p1Name="Alice"
        p2Name="Bob"
        onComplete={onComplete}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/SNAKES & LADDERS/i)).toBeInTheDocument();

    // 1. Advance through 1.5s visual matchup presentation
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('3')).toBeInTheDocument();

    // 2. Count 3 -> 2
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText('2')).toBeInTheDocument();

    // 3. Count 2 -> 1
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText('1')).toBeInTheDocument();

    // 4. Count 1 -> FIGHT!
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText('FIGHT!')).toBeInTheDocument();

    // 5. Complete transition
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onComplete).toHaveBeenCalled();
  });
});
