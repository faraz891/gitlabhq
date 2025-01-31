import { createLocalVue, shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import { refreshUserMergeRequestCounts } from '~/commons/nav/user_merge_requests';
import simplePoll from '~/lib/utils/simple_poll';
import CommitEdit from '~/vue_merge_request_widget/components/states/commit_edit.vue';
import CommitMessageDropdown from '~/vue_merge_request_widget/components/states/commit_message_dropdown.vue';
import CommitsHeader from '~/vue_merge_request_widget/components/states/commits_header.vue';
import ReadyToMerge from '~/vue_merge_request_widget/components/states/ready_to_merge.vue';
import SquashBeforeMerge from '~/vue_merge_request_widget/components/states/squash_before_merge.vue';
import { MWPS_MERGE_STRATEGY, MTWPS_MERGE_STRATEGY } from '~/vue_merge_request_widget/constants';
import eventHub from '~/vue_merge_request_widget/event_hub';

jest.mock('~/lib/utils/simple_poll', () =>
  jest.fn().mockImplementation(jest.requireActual('~/lib/utils/simple_poll').default),
);
jest.mock('~/commons/nav/user_merge_requests', () => ({
  refreshUserMergeRequestCounts: jest.fn(),
}));

const commitMessage = 'This is the commit message';
const squashCommitMessage = 'This is the squash commit message';
const commitMessageWithDescription = 'This is the commit message description';
const createTestMr = (customConfig) => {
  const mr = {
    isPipelineActive: false,
    pipeline: null,
    isPipelineFailed: false,
    isPipelinePassing: false,
    isMergeAllowed: true,
    isApproved: true,
    onlyAllowMergeIfPipelineSucceeds: false,
    ffOnlyEnabled: false,
    hasCI: false,
    ciStatus: null,
    sha: '12345678',
    squash: false,
    squashIsEnabledByDefault: false,
    squashIsReadonly: false,
    squashIsSelected: false,
    commitMessage,
    squashCommitMessage,
    commitMessageWithDescription,
    shouldRemoveSourceBranch: true,
    canRemoveSourceBranch: false,
    targetBranch: 'main',
    preferredAutoMergeStrategy: MWPS_MERGE_STRATEGY,
    availableAutoMergeStrategies: [MWPS_MERGE_STRATEGY],
    mergeImmediatelyDocsPath: 'path/to/merge/immediately/docs',
  };

  Object.assign(mr, customConfig.mr);

  return mr;
};

const createTestService = () => ({
  merge: jest.fn(),
  poll: jest.fn().mockResolvedValue(),
});

const createComponent = (customConfig = {}) => {
  const Component = Vue.extend(ReadyToMerge);

  return new Component({
    el: document.createElement('div'),
    propsData: {
      mr: createTestMr(customConfig),
      service: createTestService(),
    },
  });
};

describe('ReadyToMerge', () => {
  let vm;

  beforeEach(() => {
    vm = createComponent();
  });

  afterEach(() => {
    vm.$destroy();
  });

  describe('props', () => {
    it('should have props', () => {
      const { mr, service } = ReadyToMerge.props;

      expect(mr.type instanceof Object).toBeTruthy();
      expect(mr.required).toBeTruthy();

      expect(service.type instanceof Object).toBeTruthy();
      expect(service.required).toBeTruthy();
    });
  });

  describe('data', () => {
    it('should have default data', () => {
      expect(vm.mergeWhenBuildSucceeds).toBeFalsy();
      expect(vm.useCommitMessageWithDescription).toBeFalsy();
      expect(vm.showCommitMessageEditor).toBeFalsy();
      expect(vm.isMakingRequest).toBeFalsy();
      expect(vm.isMergingImmediately).toBeFalsy();
      expect(vm.commitMessage).toBe(vm.mr.commitMessage);
    });
  });

  describe('computed', () => {
    describe('isAutoMergeAvailable', () => {
      it('should return true when at least one merge strategy is available', () => {
        vm.mr.availableAutoMergeStrategies = [MWPS_MERGE_STRATEGY];

        expect(vm.isAutoMergeAvailable).toBe(true);
      });

      it('should return false when no merge strategies are available', () => {
        vm.mr.availableAutoMergeStrategies = [];

        expect(vm.isAutoMergeAvailable).toBe(false);
      });
    });

    describe('status', () => {
      it('defaults to success', () => {
        Vue.set(vm.mr, 'pipeline', true);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.status).toEqual('success');
      });

      it('returns failed when MR has CI but also has an unknown status', () => {
        Vue.set(vm.mr, 'hasCI', true);

        expect(vm.status).toEqual('failed');
      });

      it('returns default when MR has no pipeline', () => {
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.status).toEqual('success');
      });

      it('returns pending when pipeline is active', () => {
        Vue.set(vm.mr, 'pipeline', {});
        Vue.set(vm.mr, 'isPipelineActive', true);

        expect(vm.status).toEqual('pending');
      });

      it('returns failed when pipeline is failed', () => {
        Vue.set(vm.mr, 'pipeline', {});
        Vue.set(vm.mr, 'isPipelineFailed', true);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.status).toEqual('failed');
      });
    });

    describe('mergeButtonVariant', () => {
      it('defaults to success class', () => {
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.mergeButtonVariant).toEqual('success');
      });

      it('returns success class for success status', () => {
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);
        Vue.set(vm.mr, 'pipeline', true);

        expect(vm.mergeButtonVariant).toEqual('success');
      });

      it('returns info class for pending status', () => {
        Vue.set(vm.mr, 'availableAutoMergeStrategies', [MTWPS_MERGE_STRATEGY]);

        expect(vm.mergeButtonVariant).toEqual('info');
      });

      it('returns danger class for failed status', () => {
        vm.mr.hasCI = true;

        expect(vm.mergeButtonVariant).toEqual('danger');
      });
    });

    describe('status icon', () => {
      it('defaults to tick icon', () => {
        expect(vm.iconClass).toEqual('success');
      });

      it('shows tick for success status', () => {
        vm.mr.pipeline = true;

        expect(vm.iconClass).toEqual('success');
      });

      it('shows tick for pending status', () => {
        vm.mr.pipeline = {};
        vm.mr.isPipelineActive = true;

        expect(vm.iconClass).toEqual('success');
      });

      it('shows warning icon for failed status', () => {
        vm.mr.hasCI = true;

        expect(vm.iconClass).toEqual('warning');
      });

      it('shows warning icon for merge not allowed', () => {
        vm.mr.hasCI = true;

        expect(vm.iconClass).toEqual('warning');
      });
    });

    describe('mergeButtonText', () => {
      it('should return "Merge" when no auto merge strategies are available', () => {
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.mergeButtonText).toEqual('Merge');
      });

      it('should return "Merge in progress"', () => {
        Vue.set(vm, 'isMergingImmediately', true);

        expect(vm.mergeButtonText).toEqual('Merge in progress');
      });

      it('should return "Merge when pipeline succeeds" when the MWPS auto merge strategy is available', () => {
        Vue.set(vm, 'isMergingImmediately', false);
        Vue.set(vm.mr, 'preferredAutoMergeStrategy', MWPS_MERGE_STRATEGY);

        expect(vm.mergeButtonText).toEqual('Merge when pipeline succeeds');
      });
    });

    describe('autoMergeText', () => {
      it('should return Merge when pipeline succeeds', () => {
        Vue.set(vm.mr, 'preferredAutoMergeStrategy', MWPS_MERGE_STRATEGY);

        expect(vm.autoMergeText).toEqual('Merge when pipeline succeeds');
      });
    });

    describe('shouldShowMergeImmediatelyDropdown', () => {
      it('should return false if no pipeline is active', () => {
        Vue.set(vm.mr, 'isPipelineActive', false);
        Vue.set(vm.mr, 'onlyAllowMergeIfPipelineSucceeds', false);

        expect(vm.shouldShowMergeImmediatelyDropdown).toBe(false);
      });

      it('should return false if "Pipelines must succeed" is enabled for the current project', () => {
        Vue.set(vm.mr, 'isPipelineActive', true);
        Vue.set(vm.mr, 'onlyAllowMergeIfPipelineSucceeds', true);

        expect(vm.shouldShowMergeImmediatelyDropdown).toBe(false);
      });

      it('should return true if the MR\'s pipeline is active and "Pipelines must succeed" is not enabled for the current project', () => {
        Vue.set(vm.mr, 'isPipelineActive', true);
        Vue.set(vm.mr, 'onlyAllowMergeIfPipelineSucceeds', false);

        expect(vm.shouldShowMergeImmediatelyDropdown).toBe(true);
      });
    });

    describe('isMergeButtonDisabled', () => {
      it('should return false with initial data', () => {
        Vue.set(vm.mr, 'isMergeAllowed', true);

        expect(vm.isMergeButtonDisabled).toBe(false);
      });

      it('should return true when there is no commit message', () => {
        Vue.set(vm.mr, 'isMergeAllowed', true);
        Vue.set(vm, 'commitMessage', '');

        expect(vm.isMergeButtonDisabled).toBe(true);
      });

      it('should return true if merge is not allowed', () => {
        Vue.set(vm.mr, 'isMergeAllowed', false);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);
        Vue.set(vm.mr, 'onlyAllowMergeIfPipelineSucceeds', true);

        expect(vm.isMergeButtonDisabled).toBe(true);
      });

      it('should return true when the vm instance is making request', () => {
        Vue.set(vm.mr, 'isMergeAllowed', true);
        Vue.set(vm, 'isMakingRequest', true);

        expect(vm.isMergeButtonDisabled).toBe(true);
      });
    });

    describe('isMergeImmediatelyDangerous', () => {
      it('should always return false in CE', () => {
        expect(vm.isMergeImmediatelyDangerous).toBe(false);
      });
    });
  });

  describe('methods', () => {
    describe('shouldShowMergeControls', () => {
      it('should return false when an external pipeline is running and required to succeed', () => {
        Vue.set(vm.mr, 'isMergeAllowed', false);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.shouldShowMergeControls).toBe(false);
      });

      it('should return true when the build succeeded or build not required to succeed', () => {
        Vue.set(vm.mr, 'isMergeAllowed', true);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', []);

        expect(vm.shouldShowMergeControls).toBe(true);
      });

      it('should return true when showing the MWPS button and a pipeline is running that needs to be successful', () => {
        Vue.set(vm.mr, 'isMergeAllowed', false);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', [MWPS_MERGE_STRATEGY]);

        expect(vm.shouldShowMergeControls).toBe(true);
      });

      it('should return true when showing the MWPS button but not required for the pipeline to succeed', () => {
        Vue.set(vm.mr, 'isMergeAllowed', true);
        Vue.set(vm.mr, 'availableAutoMergeStrategies', [MWPS_MERGE_STRATEGY]);

        expect(vm.shouldShowMergeControls).toBe(true);
      });
    });

    describe('updateMergeCommitMessage', () => {
      it('should revert flag and change commitMessage', () => {
        expect(vm.commitMessage).toEqual(commitMessage);
        vm.updateMergeCommitMessage(true);

        expect(vm.commitMessage).toEqual(commitMessageWithDescription);
        vm.updateMergeCommitMessage(false);

        expect(vm.commitMessage).toEqual(commitMessage);
      });
    });

    describe('handleMergeButtonClick', () => {
      const returnPromise = (status) =>
        new Promise((resolve) => {
          resolve({
            data: {
              status,
            },
          });
        });

      it('should handle merge when pipeline succeeds', (done) => {
        jest.spyOn(eventHub, '$emit').mockImplementation(() => {});
        jest
          .spyOn(vm.service, 'merge')
          .mockReturnValue(returnPromise('merge_when_pipeline_succeeds'));
        vm.removeSourceBranch = false;
        vm.handleMergeButtonClick(true);

        setImmediate(() => {
          expect(vm.isMakingRequest).toBeTruthy();
          expect(eventHub.$emit).toHaveBeenCalledWith('MRWidgetUpdateRequested');

          const params = vm.service.merge.mock.calls[0][0];

          expect(params).toEqual(
            expect.objectContaining({
              sha: vm.mr.sha,
              commit_message: vm.mr.commitMessage,
              should_remove_source_branch: false,
              auto_merge_strategy: 'merge_when_pipeline_succeeds',
            }),
          );
          done();
        });
      });

      it('should handle merge failed', (done) => {
        jest.spyOn(eventHub, '$emit').mockImplementation(() => {});
        jest.spyOn(vm.service, 'merge').mockReturnValue(returnPromise('failed'));
        vm.handleMergeButtonClick(false, true);

        setImmediate(() => {
          expect(vm.isMakingRequest).toBeTruthy();
          expect(eventHub.$emit).toHaveBeenCalledWith('FailedToMerge', undefined);

          const params = vm.service.merge.mock.calls[0][0];

          expect(params.should_remove_source_branch).toBeTruthy();
          expect(params.auto_merge_strategy).toBeUndefined();
          done();
        });
      });

      it('should handle merge action accepted case', (done) => {
        jest.spyOn(vm.service, 'merge').mockReturnValue(returnPromise('success'));
        jest.spyOn(vm, 'initiateMergePolling').mockImplementation(() => {});
        vm.handleMergeButtonClick();

        setImmediate(() => {
          expect(vm.isMakingRequest).toBeTruthy();
          expect(vm.initiateMergePolling).toHaveBeenCalled();

          const params = vm.service.merge.mock.calls[0][0];

          expect(params.should_remove_source_branch).toBeTruthy();
          expect(params.auto_merge_strategy).toBeUndefined();
          done();
        });
      });
    });

    describe('initiateMergePolling', () => {
      it('should call simplePoll', () => {
        vm.initiateMergePolling();

        expect(simplePoll).toHaveBeenCalledWith(expect.any(Function), { timeout: 0 });
      });

      it('should call handleMergePolling', () => {
        jest.spyOn(vm, 'handleMergePolling').mockImplementation(() => {});

        vm.initiateMergePolling();

        expect(vm.handleMergePolling).toHaveBeenCalled();
      });
    });

    describe('handleMergePolling', () => {
      const returnPromise = (state) =>
        new Promise((resolve) => {
          resolve({
            data: {
              state,
              source_branch_exists: true,
            },
          });
        });

      beforeEach(() => {
        loadFixtures('merge_requests/merge_request_of_current_user.html');
      });

      it('should call start and stop polling when MR merged', (done) => {
        jest.spyOn(eventHub, '$emit').mockImplementation(() => {});
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise('merged'));
        jest.spyOn(vm, 'initiateRemoveSourceBranchPolling').mockImplementation(() => {});

        let cpc = false; // continuePollingCalled
        let spc = false; // stopPollingCalled

        vm.handleMergePolling(
          () => {
            cpc = true;
          },
          () => {
            spc = true;
          },
        );
        setImmediate(() => {
          expect(vm.service.poll).toHaveBeenCalled();
          expect(eventHub.$emit).toHaveBeenCalledWith('MRWidgetUpdateRequested');
          expect(eventHub.$emit).toHaveBeenCalledWith('FetchActionsContent');
          expect(vm.initiateRemoveSourceBranchPolling).toHaveBeenCalled();
          expect(refreshUserMergeRequestCounts).toHaveBeenCalled();
          expect(cpc).toBeFalsy();
          expect(spc).toBeTruthy();

          done();
        });
      });

      it('updates status box', (done) => {
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise('merged'));
        jest.spyOn(vm, 'initiateRemoveSourceBranchPolling').mockImplementation(() => {});

        vm.handleMergePolling(
          () => {},
          () => {},
        );

        setImmediate(() => {
          const statusBox = document.querySelector('.status-box');

          expect(statusBox.classList.contains('status-box-mr-merged')).toBeTruthy();
          expect(statusBox.textContent).toContain('Merged');

          done();
        });
      });

      it('updates merge request count badge', (done) => {
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise('merged'));
        jest.spyOn(vm, 'initiateRemoveSourceBranchPolling').mockImplementation(() => {});

        vm.handleMergePolling(
          () => {},
          () => {},
        );

        setImmediate(() => {
          expect(document.querySelector('.js-merge-counter').textContent).toBe('0');

          done();
        });
      });

      it('should continue polling until MR is merged', (done) => {
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise('some_other_state'));
        jest.spyOn(vm, 'initiateRemoveSourceBranchPolling').mockImplementation(() => {});

        let cpc = false; // continuePollingCalled
        let spc = false; // stopPollingCalled

        vm.handleMergePolling(
          () => {
            cpc = true;
          },
          () => {
            spc = true;
          },
        );
        setImmediate(() => {
          expect(cpc).toBeTruthy();
          expect(spc).toBeFalsy();

          done();
        });
      });
    });

    describe('initiateRemoveSourceBranchPolling', () => {
      it('should emit event and call simplePoll', () => {
        jest.spyOn(eventHub, '$emit').mockImplementation(() => {});

        vm.initiateRemoveSourceBranchPolling();

        expect(eventHub.$emit).toHaveBeenCalledWith('SetBranchRemoveFlag', [true]);
        expect(simplePoll).toHaveBeenCalled();
      });
    });

    describe('handleRemoveBranchPolling', () => {
      const returnPromise = (state) =>
        new Promise((resolve) => {
          resolve({
            data: {
              source_branch_exists: state,
            },
          });
        });

      it('should call start and stop polling when MR merged', (done) => {
        jest.spyOn(eventHub, '$emit').mockImplementation(() => {});
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise(false));

        let cpc = false; // continuePollingCalled
        let spc = false; // stopPollingCalled

        vm.handleRemoveBranchPolling(
          () => {
            cpc = true;
          },
          () => {
            spc = true;
          },
        );
        setImmediate(() => {
          expect(vm.service.poll).toHaveBeenCalled();

          const args = eventHub.$emit.mock.calls[0];

          expect(args[0]).toEqual('MRWidgetUpdateRequested');
          expect(args[1]).toBeDefined();
          args[1]();

          expect(eventHub.$emit).toHaveBeenCalledWith('SetBranchRemoveFlag', [false]);

          expect(cpc).toBeFalsy();
          expect(spc).toBeTruthy();

          done();
        });
      });

      it('should continue polling until MR is merged', (done) => {
        jest.spyOn(vm.service, 'poll').mockReturnValue(returnPromise(true));

        let cpc = false; // continuePollingCalled
        let spc = false; // stopPollingCalled

        vm.handleRemoveBranchPolling(
          () => {
            cpc = true;
          },
          () => {
            spc = true;
          },
        );
        setImmediate(() => {
          expect(cpc).toBeTruthy();
          expect(spc).toBeFalsy();

          done();
        });
      });
    });
  });

  describe('Remove source branch checkbox', () => {
    describe('when user can merge but cannot delete branch', () => {
      it('should be disabled in the rendered output', () => {
        const checkboxElement = vm.$el.querySelector('#remove-source-branch-input');

        expect(checkboxElement).toBeNull();
      });
    });

    describe('when user can merge and can delete branch', () => {
      beforeEach(() => {
        vm = createComponent({
          mr: { canRemoveSourceBranch: true },
        });
      });

      it('isRemoveSourceBranchButtonDisabled should be false', () => {
        expect(vm.isRemoveSourceBranchButtonDisabled).toBe(false);
      });

      it('removed source branch should be enabled in rendered output', () => {
        const checkboxElement = vm.$el.querySelector('#remove-source-branch-input');

        expect(checkboxElement).not.toBeNull();
      });
    });
  });

  describe('render children components', () => {
    let wrapper;
    const localVue = createLocalVue();

    const createLocalComponent = (customConfig = {}) => {
      wrapper = shallowMount(localVue.extend(ReadyToMerge), {
        localVue,
        propsData: {
          mr: createTestMr(customConfig),
          service: createTestService(),
        },
      });
    };

    afterEach(() => {
      wrapper.destroy();
    });

    const findCheckboxElement = () => wrapper.find(SquashBeforeMerge);
    const findCommitsHeaderElement = () => wrapper.find(CommitsHeader);
    const findCommitEditElements = () => wrapper.findAll(CommitEdit);
    const findCommitDropdownElement = () => wrapper.find(CommitMessageDropdown);
    const findFirstCommitEditLabel = () => findCommitEditElements().at(0).props('label');

    describe('squash checkbox', () => {
      it('should be rendered when squash before merge is enabled and there is more than 1 commit', () => {
        createLocalComponent({
          mr: { commitsCount: 2, enableSquashBeforeMerge: true },
        });

        expect(findCheckboxElement().exists()).toBeTruthy();
      });

      it('should not be rendered when squash before merge is disabled', () => {
        createLocalComponent({ mr: { commitsCount: 2, enableSquashBeforeMerge: false } });

        expect(findCheckboxElement().exists()).toBeFalsy();
      });

      it('should not be rendered when there is only 1 commit', () => {
        createLocalComponent({ mr: { commitsCount: 1, enableSquashBeforeMerge: true } });

        expect(findCheckboxElement().exists()).toBeFalsy();
      });

      describe('squash options', () => {
        it.each`
          squashState           | state           | prop            | expectation
          ${'squashIsReadonly'} | ${'enabled'}    | ${'isDisabled'} | ${false}
          ${'squashIsSelected'} | ${'selected'}   | ${'value'}      | ${false}
          ${'squashIsSelected'} | ${'unselected'} | ${'value'}      | ${false}
        `(
          'is $state when squashIsReadonly returns $expectation ',
          ({ squashState, prop, expectation }) => {
            createLocalComponent({
              mr: { commitsCount: 2, enableSquashBeforeMerge: true, [squashState]: expectation },
            });

            expect(findCheckboxElement().props(prop)).toBe(expectation);
          },
        );

        it('is not rendered for "Do not allow" option', () => {
          createLocalComponent({
            mr: {
              commitsCount: 2,
              enableSquashBeforeMerge: true,
              squashIsReadonly: true,
              squashIsSelected: false,
            },
          });

          expect(findCheckboxElement().exists()).toBe(false);
        });
      });
    });

    describe('commits count collapsible header', () => {
      it('should be rendered when fast-forward is disabled', () => {
        createLocalComponent();

        expect(findCommitsHeaderElement().exists()).toBeTruthy();
      });

      describe('when fast-forward is enabled', () => {
        it('should be rendered if squash and squash before are enabled and there is more than 1 commit', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              enableSquashBeforeMerge: true,
              squashIsSelected: true,
              commitsCount: 2,
            },
          });

          expect(findCommitsHeaderElement().exists()).toBeTruthy();
        });

        it('should not be rendered if squash before merge is disabled', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              enableSquashBeforeMerge: false,
              squash: true,
              commitsCount: 2,
            },
          });

          expect(findCommitsHeaderElement().exists()).toBeFalsy();
        });

        it('should not be rendered if squash is disabled', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squash: false,
              enableSquashBeforeMerge: true,
              commitsCount: 2,
            },
          });

          expect(findCommitsHeaderElement().exists()).toBeFalsy();
        });

        it('should not be rendered if commits count is 1', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squash: true,
              enableSquashBeforeMerge: true,
              commitsCount: 1,
            },
          });

          expect(findCommitsHeaderElement().exists()).toBeFalsy();
        });
      });
    });

    describe('commits edit components', () => {
      describe('when fast-forward merge is enabled', () => {
        it('should not be rendered if squash is disabled', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squash: false,
              enableSquashBeforeMerge: true,
              commitsCount: 2,
            },
          });

          expect(findCommitEditElements().length).toBe(0);
        });

        it('should not be rendered if squash before merge is disabled', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squash: true,
              enableSquashBeforeMerge: false,
              commitsCount: 2,
            },
          });

          expect(findCommitEditElements().length).toBe(0);
        });

        it('should not be rendered if there is only one commit', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squash: true,
              enableSquashBeforeMerge: true,
              commitsCount: 1,
            },
          });

          expect(findCommitEditElements().length).toBe(0);
        });

        it('should have one edit component if squash is enabled and there is more than 1 commit', () => {
          createLocalComponent({
            mr: {
              ffOnlyEnabled: true,
              squashIsSelected: true,
              enableSquashBeforeMerge: true,
              commitsCount: 2,
            },
          });

          expect(findCommitEditElements().length).toBe(1);
          expect(findFirstCommitEditLabel()).toBe('Squash commit message');
        });
      });

      it('should have one edit component when squash is disabled', () => {
        createLocalComponent();

        expect(findCommitEditElements().length).toBe(1);
      });

      it('should have two edit components when squash is enabled and there is more than 1 commit', () => {
        createLocalComponent({
          mr: {
            commitsCount: 2,
            squashIsSelected: true,
            enableSquashBeforeMerge: true,
          },
        });

        expect(findCommitEditElements().length).toBe(2);
      });

      it('should have one edit components when squash is enabled and there is 1 commit only', () => {
        createLocalComponent({
          mr: {
            commitsCount: 1,
            squash: true,
            enableSquashBeforeMerge: true,
          },
        });

        expect(findCommitEditElements().length).toBe(1);
      });

      it('should have correct edit merge commit label', () => {
        createLocalComponent();

        expect(findFirstCommitEditLabel()).toBe('Merge commit message');
      });

      it('should have correct edit squash commit label', () => {
        createLocalComponent({
          mr: {
            commitsCount: 2,
            squashIsSelected: true,
            enableSquashBeforeMerge: true,
          },
        });

        expect(findFirstCommitEditLabel()).toBe('Squash commit message');
      });
    });

    describe('commits dropdown', () => {
      it('should not be rendered if squash is disabled', () => {
        createLocalComponent();

        expect(findCommitDropdownElement().exists()).toBeFalsy();
      });

      it('should  be rendered if squash is enabled and there is more than 1 commit', () => {
        createLocalComponent({
          mr: { enableSquashBeforeMerge: true, squashIsSelected: true, commitsCount: 2 },
        });

        expect(findCommitDropdownElement().exists()).toBeTruthy();
      });
    });
  });

  describe('Merge controls', () => {
    describe('when allowed to merge', () => {
      beforeEach(() => {
        vm = createComponent({
          mr: { isMergeAllowed: true, canRemoveSourceBranch: true },
        });
      });

      it('shows remove source branch checkbox', () => {
        expect(vm.$el.querySelector('.js-remove-source-branch-checkbox')).not.toBeNull();
      });

      it('shows modify commit message button', () => {
        expect(vm.$el.querySelector('.js-modify-commit-message-button')).toBeDefined();
      });

      it('does not show message about needing to resolve items', () => {
        expect(vm.$el.querySelector('.js-resolve-mr-widget-items-message')).toBeNull();
      });
    });

    describe('when not allowed to merge', () => {
      beforeEach(() => {
        vm = createComponent({
          mr: { isMergeAllowed: false },
        });
      });

      it('does not show remove source branch checkbox', () => {
        expect(vm.$el.querySelector('.js-remove-source-branch-checkbox')).toBeNull();
      });

      it('shows message to resolve all items before being allowed to merge', () => {
        expect(vm.$el.querySelector('.js-resolve-mr-widget-items-message')).toBeDefined();
      });
    });
  });

  describe('Merge request project settings', () => {
    describe('when the merge commit merge method is enabled', () => {
      beforeEach(() => {
        vm = createComponent({
          mr: { ffOnlyEnabled: false },
        });
      });

      it('should not show fast forward message', () => {
        expect(vm.$el.querySelector('.mr-fast-forward-message')).toBeNull();
      });

      it('should show "Modify commit message" button', () => {
        expect(vm.$el.querySelector('.js-modify-commit-message-button')).toBeDefined();
      });
    });

    describe('when the fast-forward merge method is enabled', () => {
      beforeEach(() => {
        vm = createComponent({
          mr: { ffOnlyEnabled: true },
        });
      });

      it('should show fast forward message', () => {
        expect(vm.$el.querySelector('.mr-fast-forward-message')).toBeDefined();
      });

      it('should not show "Modify commit message" button', () => {
        expect(vm.$el.querySelector('.js-modify-commit-message-button')).toBeNull();
      });
    });
  });

  describe('with a mismatched SHA', () => {
    const findMismatchShaBlock = () => vm.$el.querySelector('.js-sha-mismatch');

    beforeEach(() => {
      vm = createComponent({
        mr: {
          isSHAMismatch: true,
          mergeRequestDiffsPath: '/merge_requests/1/diffs',
        },
      });
    });

    it('displays a warning message', () => {
      expect(findMismatchShaBlock()).toExist();
    });

    it('warns the user to refresh to review', () => {
      expect(findMismatchShaBlock().textContent.trim()).toBe(
        'New changes were added. Reload the page to review them',
      );
    });

    it('displays link to the diffs tab', () => {
      expect(findMismatchShaBlock().querySelector('a').href).toContain(vm.mr.mergeRequestDiffsPath);
    });
  });
});
