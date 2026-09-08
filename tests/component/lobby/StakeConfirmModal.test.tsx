// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StakeConfirmModal } from '../../../src/components/lobby/StakeConfirmModal';

describe('StakeConfirmModal Component Tests', () => {
  it('should render stake details and economics breakdown for room creation', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <StakeConfirmModal
        isOpen={true}
        mode="create"
        gameType="snake"
        stakeAmount={100}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/Confirm Duel Entry/i)).toBeInTheDocument();
    expect(screen.getByText(/Your Entry Stake:/i)).toBeInTheDocument();
    expect(screen.getByText('+180G')).toBeInTheDocument(); // Net Winner prize
    expect(screen.getByText('-20G')).toBeInTheDocument(); // Arena fee
    expect(screen.getByText('+95G')).toBeInTheDocument(); // Draw refund

    // Confirm action
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Create/i });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();

    // Cancel action
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('should not render modal when isOpen is false', () => {
    const { container } = render(
      <StakeConfirmModal
        isOpen={false}
        mode="create"
        gameType="snake"
        stakeAmount={100}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
