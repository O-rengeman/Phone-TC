import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarkerList } from './MarkerList';
import type { Marker } from '../utils/export';

const makeMarker = (overrides: Partial<Marker> = {}): Marker => ({
  id: 1,
  tc: '01:00:00:00',
  time: '12:00',
  color: 'Red',
  reelName: 'AX',
  take: 1,
  sceneName: '001',
  comment: '',
  ...overrides,
});

describe('MarkerList', () => {
  const baseProps = {
    markers: [] as Marker[],
    addMarker: vi.fn(),
    removeMarker: vi.fn(),
    updateMarkerComment: vi.fn(),
    exportToEDL: vi.fn(),
    exportToALE: vi.fn(),
    isMobile: false,
    tr: (key: string) => key,
  };

  it('shows empty message when no markers', () => {
    render(<MarkerList {...baseProps} />);
    expect(screen.getByText('markers.none')).toBeTruthy();
  });

  it('renders markers with correct data', () => {
    const markers = [makeMarker({ id: 1, tc: '01:00:00:00', sceneName: '001', comment: 'Test comment' })];
    render(<MarkerList {...baseProps} markers={markers} />);
    expect(screen.getByText('01:00:00:00')).toBeTruthy();
    expect(screen.getByText('Sc.001 Tk.1')).toBeTruthy();
    expect(screen.getByText('12:00')).toBeTruthy();
  });

  it('calls removeMarker when delete button is clicked', () => {
    const removeMarker = vi.fn();
    const markers = [makeMarker({ id: 1 })];
    render(<MarkerList {...baseProps} markers={markers} removeMarker={removeMarker} />);
    fireEvent.click(screen.getByText('✕'));
    expect(removeMarker).toHaveBeenCalledWith(1);
  });

  it('calls updateMarkerComment when comment input changes', () => {
    const updateMarkerComment = vi.fn();
    const markers = [makeMarker({ id: 1, comment: '' })];
    render(<MarkerList {...baseProps} markers={markers} updateMarkerComment={updateMarkerComment} />);
    const input = screen.getByPlaceholderText('placeholder.comment');
    fireEvent.change(input, { target: { value: 'New comment' } });
    expect(updateMarkerComment).toHaveBeenCalledWith(1, 'New comment');
  });

  it('calls exportToEDL when EDL button is clicked', () => {
    const exportToEDL = vi.fn();
    const markers = [makeMarker({ id: 1 })];
    render(<MarkerList {...baseProps} markers={markers} exportToEDL={exportToEDL} />);
    fireEvent.click(screen.getByText('EDL'));
    expect(exportToEDL).toHaveBeenCalledOnce();
  });

  it('calls exportToALE when ALE button is clicked', () => {
    const exportToALE = vi.fn();
    const markers = [makeMarker({ id: 1 })];
    render(<MarkerList {...baseProps} markers={markers} exportToALE={exportToALE} />);
    fireEvent.click(screen.getByText('ALE'));
    expect(exportToALE).toHaveBeenCalledOnce();
  });

  it('disables export buttons when no markers', () => {
    render(<MarkerList {...baseProps} />);
    const edlBtn = screen.getByText('EDL').closest('button');
    const aleBtn = screen.getByText('ALE').closest('button');
    expect(edlBtn?.getAttribute('disabled')).not.toBeNull();
    expect(aleBtn?.getAttribute('disabled')).not.toBeNull();
  });

  it('shows mobile quick mark buttons when isMobile is true', () => {
    render(<MarkerList {...baseProps} isMobile />);
    expect(screen.getByText('color.red')).toBeTruthy();
    expect(screen.getByText('color.blue')).toBeTruthy();
    expect(screen.getByText('color.green')).toBeTruthy();
    expect(screen.getByText('color.yellow')).toBeTruthy();
  });

  it('calls addMarker when mobile quick mark buttons are clicked', () => {
    const addMarker = vi.fn();
    render(<MarkerList {...baseProps} isMobile addMarker={addMarker} />);
    fireEvent.click(screen.getByText('color.red'));
    expect(addMarker).toHaveBeenCalledWith('Red');
  });

  it('does not show mobile quick mark buttons when isMobile is false', () => {
    render(<MarkerList {...baseProps} isMobile={false} />);
    expect(screen.queryByText('color.red')).toBeNull();
  });
});