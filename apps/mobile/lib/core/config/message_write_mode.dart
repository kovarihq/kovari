enum WriteMode { legacy, dual, plaintext }

class MessageWriteMode {
  /// Compile-time switch for the outgoing message write contract on mobile.
  /// Flip to WriteMode.plaintext to stop E2EE in the send path.
  static const WriteMode current = WriteMode.plaintext;
}
