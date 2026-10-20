import { expect, test } from 'claude-code/testing'

import { stripKind } from '../hooks/prompt'

test('stripKind takes the kind line off and keeps the prompt under it', async () => {
  expect(stripKind('[fix]\nSửa cái band.\nChạy test.')).toEqual({ kind: 'fix', text: 'Sửa cái band.\nChạy test.' })
  expect(stripKind('  [git]\r\nPush feat/x.')).toEqual({ kind: 'git', text: 'Push feat/x.' })
  // Not a kind the prompt names: the line still goes, the kind is unknown.
  expect(stripKind('[poem]\nRoses.')).toEqual({ kind: null, text: 'Roses.' })
  // No kind line at all: the reply as it is.
  expect(stripKind('Just the prompt.')).toEqual({ kind: null, text: 'Just the prompt.' })
  expect(stripKind('')).toEqual({ kind: null, text: '' })
})
