export interface ChannelSendInput {
  recipientUserId: string;
  recipientEmail?: string;
  subject?: string;
  body: string;
}

export interface ChannelAdapter {
  send(input: ChannelSendInput): Promise<void>;
}
