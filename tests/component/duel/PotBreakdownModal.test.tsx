// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PotBreakdownModal } from '../../../src/components/duel/PotBreakdownModal';

describe('PotBreakdownModal Component Tests', () => {
  it('should render pot breakdown economics details and handle close', () => {
    const onClose = vi.fn();

    render(
      <PotBreakdownModal
        stake={100}
        pot={200}
        p1Name="Alice"
        p2Name="Bob"
        onClose={onClose}
      />
    );

    expect(screen.getByText(/DUEL POT BREAKDOWN/i)).toBeInTheDocument();
    expect(screen.getByText(/TOTAL MATCH POT:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/180/).length).toBeGreaterThanOrEqual(1); // Winner net
    expect(screen.getAllByText(/20/).length).toBeGreaterThanOrEqual(1); // Arena fee
    expect(screen.getAllByText(/95/).length).toBeGreaterThanOrEqual(1); // Draw refund

    const closeBtn = screen.getByRole('button', { name: /GOT IT/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
