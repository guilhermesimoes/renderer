/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2023 Comcast Cable Communications Management, LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it, vi } from 'vitest';
import { AnimationManager } from './AnimationManager.js';
import type { CoreNode } from '../CoreNode.js';
import type { IAnimationController } from '../../common/IAnimationController.js';

/**
 * Create a minimal mock node that satisfies CoreAnimation's needs.
 * CoreAnimation accesses node[key] for start values, node.shader, and node.destroyed.
 */
function createMockNode(overrides: Record<string, unknown> = {}): CoreNode {
  return {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    alpha: 1,
    rotation: 0,
    scale: 1,
    color: 0xffffffff,
    destroyed: false,
    shader: null,
    ...overrides,
  } as unknown as CoreNode;
}

describe('AnimationManager', () => {
  describe('createAnimation', () => {
    it('should create distinct controller instances', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const controller1 = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 1000 },
      );
      const controller2 = manager.createAnimation(
        node,
        { y: 200 },
        { duration: 1000 },
      );

      expect(controller1).not.toBe(controller2);
    });

    it('should create controllers in stopped state', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const ctrl = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 1000 },
      );

      expect(ctrl.state).toBe('stopped');
      ctrl.start();
      expect(ctrl.state).toBe('scheduled');
    });
  });

  describe('animation lifecycle', () => {
    it('should animate correct values across sequential animations', () => {
      const manager = new AnimationManager();
      const nodeA = createMockNode({ x: 0 });
      const nodeB = createMockNode({ y: 0 });

      // Create, start, finish animation A on nodeA
      const ctrlA = manager.createAnimation(
        nodeA,
        { x: 100 },
        { duration: 100 },
      );
      ctrlA.start();
      manager.update(200); // finishes

      // Create animation B on nodeB
      const ctrlB = manager.createAnimation(
        nodeB,
        { y: 500 },
        { duration: 100 },
      );
      ctrlB.start();

      // Advance half-way
      manager.update(50);

      // nodeB.y should be interpolating toward 500
      const nodeRecord = nodeB as unknown as Record<string, number>;
      expect(nodeRecord['y']).toBeGreaterThan(0);
      expect(nodeRecord['y']).toBeLessThanOrEqual(500);

      // nodeA.x should remain at 100 (its finished value), unaffected by B
      const nodeARecord = nodeA as unknown as Record<string, number>;
      expect(nodeARecord['x']).toBe(100);
    });

    it('should allow restarting a controller from its stopped handler', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const ctrl = manager.createAnimation(node, { x: 100 }, { duration: 100 });
      ctrl.start();

      let restartCount = 0;
      ctrl.on('stopped', () => {
        if (restartCount < 1) {
          restartCount++;
          ctrl.start();
        }
      });

      // Finish the animation -- stopped handler restarts it
      manager.update(200);

      // Controller should be active again
      expect(ctrl.state).toBe('scheduled');
    });

    it('should not corrupt a new animation when pause() is called on a finished controller', () => {
      const manager = new AnimationManager();
      const node = createMockNode({ x: 0 });

      // Create and finish animation
      const ctrl1 = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 100 },
      );
      ctrl1.start();
      manager.update(200); // finishes

      // Create new animation on same node
      const ctrl2 = manager.createAnimation(
        node,
        { x: 500 },
        { duration: 100 },
      );
      ctrl2.start();

      // Stale pause() on old controller should be a no-op
      ctrl1.pause();

      // ctrl2's animation should still be running
      manager.update(50);

      const nodeRecord = node as unknown as Record<string, number>;
      expect(nodeRecord['x']).toBeGreaterThan(100);
    });

    it('pause() should be a no-op when controller is already stopped', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const ctrl = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 1000 },
      );
      ctrl.pause();
      expect(ctrl.state).toBe('stopped');
    });

    it('should NOT release looping animations on loop boundary', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const ctrl = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 100, loop: true },
      );
      ctrl.start();

      // Advance past the duration -- should loop, not stop
      manager.update(200);

      expect(ctrl.state).not.toBe('stopped');
    });

    it('should stop on node destruction', () => {
      const manager = new AnimationManager();
      const node = createMockNode();
      const stoppedSpy = vi.fn();

      const ctrl = manager.createAnimation(
        node,
        { x: 100 },
        { duration: 1000 },
      );
      ctrl.on('stopped', stoppedSpy);
      ctrl.start();

      (node as unknown as Record<string, unknown>).destroyed = true;
      manager.update(16);

      expect(ctrl.state).toBe('stopped');
      expect(stoppedSpy).toHaveBeenCalledTimes(1);
    });

    it('should create distinct controllers for concurrent animations', () => {
      const manager = new AnimationManager();
      const node = createMockNode();

      const controllers: IAnimationController[] = [];
      for (let i = 0; i < 3; i++) {
        const c = manager.createAnimation(
          node,
          { x: i * 100 },
          { duration: 1000 },
        );
        c.start();
        controllers.push(c);
      }

      expect(controllers[0]).not.toBe(controllers[1]);
      expect(controllers[1]).not.toBe(controllers[2]);
    });
  });
});
