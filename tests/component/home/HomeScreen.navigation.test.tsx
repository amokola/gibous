// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomeScreen } from '../../../src/components/home/HomeScreen';

describe('HomeScreen navigation', () => {
  it('keeps Home content mounted while the Lobby route is requested', () => {
    const onSelectAndPlayGame = vi.fn();
    render(
      <HomeScreen
        userName="Test Player"
        balance={1}
        onSelectAndPlayGame={onSelectAndPlayGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lobby' }));

    expect(onSelectAndPlayGame).toHaveBeenCalledWith('snake');
    expect(screen.getByText('Duel Arenas')).toBeInTheDocument();
  });
});
