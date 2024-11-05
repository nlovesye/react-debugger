/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

// Mutable source version can be anything (e.g. number, string, immutable data structure)
// so long as it changes every time any part of the source changes.

// The subset of a Thenable required by things thrown by Suspense.
// This doesn't require a value to be passed to either handler.

// The subset of a Promise that React APIs rely on. This resolves a value.
// This doesn't require a return value neither from the handler nor the
// then function.