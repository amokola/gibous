// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GameBadge } from '../../../src/components/ui/GameBadge';

describe('GameBadge Component', () => {
  it('renders correct image source and alt text for snake', () => {
    render(<GameBadge game="snake" size="md" />);
    const img = screen.getByRole('img', { name: /snakes & ladders/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/snake.png');
    expect(img.className).toContain('w-12 h-12');
  });

  it('renders correct image source and alt text for connect4', () => {
    render(<GameBadge game="connect4" size="xs" />);
    const img = screen.getByRole('img', { name: /four in a row/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/connect4.png');
    expect(img.className).toContain('w-5 h-5');
  });

  it('renders correct image source and alt text for rps', () => {
    render(<GameBadge game="rps" size="sm" />);
    const img = screen.getByRole('img', { name: /rock paper scissors/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/rps.png');
    expect(img.className).toContain('w-7 h-7');
  });

  it('applies custom className cleanly', () => {
    render(<GameBadge game="snake" className="custom-class" />);
    const img = screen.getByRole('img', { name: /snakes & ladders/i });
    expect(img.className).toContain('custom-class');
  });
});
