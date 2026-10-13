// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionBanner } from '../../../src/components/ui/ConnectionBanner';

describe('ConnectionBanner auth guidance', () => {
  it('tells players to reopen Gibous from Telegram after auth expires', () => {
    render(<ConnectionBanner connectionState="AUTH_REQUIRED" onReconnect={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/reopen gibous from telegram/i);
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });
});
