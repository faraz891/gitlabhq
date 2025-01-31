# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Timelog do
  subject { create(:timelog) }

  let(:issue) { create(:issue) }
  let(:merge_request) { create(:merge_request) }

  it { is_expected.to belong_to(:project) }
  it { is_expected.to belong_to(:issue).touch(true) }
  it { is_expected.to belong_to(:merge_request).touch(true) }

  it { is_expected.to be_valid }

  it { is_expected.to validate_presence_of(:time_spent) }
  it { is_expected.to validate_presence_of(:user) }

  it { expect(subject.project_id).not_to be_nil }

  describe 'Issuable validation' do
    it 'is invalid if issue_id and merge_request_id are missing' do
      subject.attributes = { issue: nil, merge_request: nil }

      expect(subject).to be_invalid
    end

    it 'is invalid if issue_id and merge_request_id are set' do
      subject.attributes = { issue: issue, merge_request: merge_request }

      expect(subject).to be_invalid
    end

    it 'is valid if only issue_id is set' do
      subject.attributes = { issue: issue, merge_request: nil }

      expect(subject).to be_valid
    end

    it 'is valid if only merge_request_id is set' do
      subject.attributes = { merge_request: merge_request, issue: nil }

      expect(subject).to be_valid
    end

    describe 'when importing' do
      it 'is valid if issue_id and merge_request_id are missing' do
        subject.attributes = { issue: nil, merge_request: nil, importing: true }

        expect(subject).to be_valid
      end
    end
  end

  describe 'scopes' do
    describe 'for_issues_in_group' do
      it 'return timelogs created for group issues' do
        group = create(:group)
        subgroup = create(:group, parent: group)

        create(:issue_timelog)
        timelog1 = create(:issue_timelog, issue: create(:issue, project: create(:project, group: group)))
        timelog2 = create(:issue_timelog, issue: create(:issue, project: create(:project, group: subgroup)))

        expect(described_class.for_issues_in_group(group)).to contain_exactly(timelog1, timelog2)
      end
    end

    describe 'between_times' do
      it 'returns collection of timelogs within given times' do
        create(:issue_timelog, spent_at: 65.days.ago)
        timelog1 = create(:issue_timelog, spent_at: 15.days.ago)
        timelog2 = create(:issue_timelog, spent_at: 5.days.ago)
        timelogs = described_class.between_times(20.days.ago, 1.day.ago)

        expect(timelogs).to contain_exactly(timelog1, timelog2)
      end
    end
  end
end
