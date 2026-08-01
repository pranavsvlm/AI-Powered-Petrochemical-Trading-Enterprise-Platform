import { isRealChannel } from './comms-channel';

describe('isRealChannel', () => {
  it('treats EMAIL and IN_APP as real', () => {
    expect(isRealChannel('EMAIL')).toBe(true);
    expect(isRealChannel('IN_APP')).toBe(true);
  });

  it('treats WHATSAPP, SMS, and PUSH as seams, not real', () => {
    expect(isRealChannel('WHATSAPP')).toBe(false);
    expect(isRealChannel('SMS')).toBe(false);
    expect(isRealChannel('PUSH')).toBe(false);
  });
});
