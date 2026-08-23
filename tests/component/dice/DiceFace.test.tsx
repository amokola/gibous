// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiceFace } from '../../../src/components/game/dice/DiceFace';
import { PipPattern } from '../../../src/components/game/dice/PipPattern';

describe('DiceFace and PipPattern Components', () => {
  it('renders face 1 with red ace center pip', () => {
    const { container } = render(<PipPattern faceNumber={1} />);
    const redPip = container.querySelector('.bg-\\[\\#9b2c2c\\]');
    expect(redPip).not.toBeNull();
  });

  it('renders face 6 with 6 black pips', () => {
    const { container } = render(<PipPattern faceNumber={6} />);
    const blackPips = container.querySelectorAll('.bg-\\[\\#1a1a1a\\]');
    expect(blackPips.length).toBe(6);
  });

  it('renders DiceFace with correct 3D transform for face 2', () => {
    const { container } = render(<DiceFace faceNumber={2} />);
    const faceEl = container.firstChild as HTMLElement;
    expect(faceEl).toBeInTheDocument();
    expect(faceEl.style.transform).toContain('rotateX(90deg)');
    expect(faceEl.style.transform).toContain('translateZ(28px)');
  });
});
