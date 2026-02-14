import React from 'react';
import { Modal, type ModalProps } from 'react-native';

/**
 * Native — just forwards to React Native's Modal.
 */
export function InlineModal(props: ModalProps) {
  return <Modal {...props} />;
}
