// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameMasteryRow } from '../../../src/components/profile/GameMasteryRow';

describe('GameMasteryRow Component', () => {
  const defaultProps = {
    snakesRecord: { wins: 10, losses: 5, pnl: 45 },
    connect4Record: { wins: 8, losses: 2, pnl: 28 },
    rpsRecord: { wins: 15, losses: 3, pnl: 60 },
  };

  it('renders all three game badges with correct image sources', () => {
    render(<GameMasteryRow {...defaultProps} />);

    const snakeBadge = screen.getByRole('img', { name: /snakes & ladders/i });
    expect(snakeBadge).toBeInTheDocument();
    expect(snakeBadge).toHaveAttribute('src', '/images/snake.png');

    const connect4Badge = screen.getByRole('img', { name: /four in a row/i });
    expect(connect4Badge).toBeInTheDocument();
    expect(connect4Badge).toHaveAttribute('src', '/images/connect4.png');

    const rpsBadge = screen.getByRole('img', { name: /rock paper scissors/i });
    expect(rpsBadge).toBeInTheDocument();
    expect(rpsBadge).toHaveAttribute('src', '/images/rps.png');
  });

  it('renders titles and calculated win rates and PnL', () => {
    render(<GameMasteryRow {...defaultProps} />);

    expect(screen.getByText('Snakes & Ladders')).toBeInTheDocument();
    expect(screen.getByText('Four in a Row')).toBeInTheDocument();
    expect(screen.getByText('Rock Paper Scissors')).toBeInTheDocument();

    expect(screen.getByText(/67% Win Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/80% Win Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/83% Win Rate/i)).toBeInTheDocument();

    expect(screen.getByText('+45 GRAM')).toBeInTheDocument();
    expect(screen.getByText('+28 GRAM')).toBeInTheDocument();
    expect(screen.getByText('+60 GRAM')).toBeInTheDocument();
  });
});
