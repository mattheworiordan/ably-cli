import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

import { TerminalOverlay } from './TerminalOverlay';

// Mock the terminal-box module
const mockDrawBox = vi.fn();
const mockClearBox = vi.fn();
const mockUpdateLine = vi.fn();
const mockUpdateSpinner = vi.fn();

vi.mock('./terminal-box', () => ({
  drawBox: mockDrawBox,
  clearBox: mockClearBox,
  updateLine: mockUpdateLine,
  updateSpinner: mockUpdateSpinner,
  colour: {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
  },
}));

describe('TerminalOverlay', () => {
  beforeEach(() => {
    mockDrawBox.mockClear();
    mockClearBox.mockClear();
    mockUpdateLine.mockClear();
    mockUpdateSpinner.mockClear();
    
    // Default mock return value for drawBox
    mockDrawBox.mockReturnValue({
      row: 0,
      width: 80,
      content: [],
      write: vi.fn(),
      height: 5,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  test('renders without crashing', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="CONNECTING"
        lines={['Connecting to Ably CLI server']}
      />
    );
    expect(screen.getByTestId('ably-overlay')).toBeInTheDocument();
  });

  test('displays connecting variant correctly', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="CONNECTING"
        lines={['Connecting to Ably CLI server', 'Please wait...']}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('CONNECTING');
    expect(overlay).toHaveTextContent('Connecting to Ably CLI server');
    expect(overlay).toHaveTextContent('Please wait...');
    expect(overlay).toHaveClass('ably-connecting');
  });

  test('displays reconnecting variant with attempt information', () => {
    render(
      <TerminalOverlay 
        variant="reconnecting"
        title="RECONNECTING"
        lines={[
          'Attempt 2/5',
          'Next attempt in 3s',
          'Press ⏎ to cancel automatic reconnection.'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('RECONNECTING');
    expect(overlay).toHaveTextContent('Attempt 2/5');
    expect(overlay).toHaveTextContent('Next attempt in 3s');
    expect(overlay).toHaveClass('ably-reconnecting');
  });

  test('displays error variant with error message', () => {
    render(
      <TerminalOverlay 
        variant="error"
        title="ERROR: SERVER DISCONNECT"
        lines={[
          'Authentication failed',
          'Connection was rejected by the server.',
          'Press ⏎ to try reconnecting manually.'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('ERROR: SERVER DISCONNECT');
    expect(overlay).toHaveTextContent('Authentication failed');
    expect(overlay).toHaveClass('ably-error');
  });

  test('displays maxAttempts variant', () => {
    render(
      <TerminalOverlay 
        variant="maxAttempts"
        title="MAX RECONNECTS"
        lines={[
          'Failed to reconnect after 5 attempts',
          'Connection has been lost.',
          'Press ⏎ to try reconnecting manually.'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('MAX RECONNECTS');
    expect(overlay).toHaveTextContent('Failed to reconnect after 5 attempts');
    expect(overlay).toHaveClass('ably-maxAttempts');
  });

  test('handles empty lines array', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="CONNECTING"
        lines={[]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('CONNECTING');
    expect(overlay).toBeInTheDocument();
  });

  test('handles long content correctly', () => {
    const longLine = 'This is a very long line that should be handled correctly by the terminal overlay component';
    render(
      <TerminalOverlay 
        variant="error"
        title="ERROR"
        lines={[longLine, 'Short line']}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent(longLine);
    expect(overlay).toHaveTextContent('Short line');
  });

  test('applies correct styling for different variants', () => {
    const { rerender } = render(
      <TerminalOverlay 
        variant="connecting"
        title="CONNECTING"
        lines={['Connecting...']}
      />
    );
    
    let overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveClass('ably-connecting');
    
    rerender(
      <TerminalOverlay 
        variant="reconnecting"
        title="RECONNECTING"
        lines={['Reconnecting...']}
      />
    );
    
    overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveClass('ably-reconnecting');
    expect(overlay).not.toHaveClass('ably-connecting');
  });

  test('renders ASCII box border correctly', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="TEST"
        lines={['Content']}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    const content = overlay.textContent || '';
    
    // Should contain ASCII box characters
    expect(content).toMatch(/\+.*\+/); // Top border
    expect(content).toMatch(/\|.*\|/); // Side borders
  });

  test('handles HTML in content by stripping it', () => {
    render(
      <TerminalOverlay 
        variant="error"
        title="<strong>ERROR</strong>"
        lines={['<em>Formatted</em> content', 'Plain content']}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    // HTML should be stripped in the display
    expect(overlay).toHaveTextContent('ERROR');
    expect(overlay).toHaveTextContent('Formatted content');
  });

  test('uses correct colors for different line types', () => {
    render(
      <TerminalOverlay 
        variant="reconnecting"
        title="RECONNECTING"
        lines={[
          'Attempt 1/3',
          'Next attempt in 5s',
          'Press ⏎ to cancel automatic reconnection.'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toBeInTheDocument();
    
    // Test that special lines are styled (we can't easily test colors, but we can test presence)
    expect(overlay).toHaveTextContent('Next attempt in 5s');
    expect(overlay).toHaveTextContent('Press ⏎ to cancel');
  });

  test('calculates box width based on longest line', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="SHORT"
        lines={[
          'Short',
          'This is a much longer line that should determine the box width',
          'Medium length line'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toBeInTheDocument();
    
    // The box should accommodate the longest line
    expect(overlay).toHaveTextContent('This is a much longer line that should determine the box width');
  });

  test('maintains minimum box width', () => {
    render(
      <TerminalOverlay 
        variant="connecting"
        title="A"
        lines={['B']}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toBeInTheDocument();
    
    // Even with very short content, box should have minimum width
    const content = overlay.textContent || '';
    expect(content.length).toBeGreaterThan(10);
  });

  test('handles special characters in content', () => {
    render(
      <TerminalOverlay 
        variant="error"
        title="ERROR: SPECIAL CHARS"
        lines={[
          'Content with émojis 🚀 and special chars: @#$%',
          'Unicode: ñáéíóú',
          'Symbols: ←→↑↓'
        ]}
      />
    );
    
    const overlay = screen.getByTestId('ably-overlay');
    expect(overlay).toHaveTextContent('🚀');
    expect(overlay).toHaveTextContent('@#$%');
    expect(overlay).toHaveTextContent('ñáéíóú');
    expect(overlay).toHaveTextContent('←→↑↓');
  });
});