# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Namespace::TraversalHierarchy, type: :model do
  let_it_be(:root, reload: true) { create(:group, :with_hierarchy) }

  describe '.for_namespace' do
    let(:hierarchy) { described_class.for_namespace(group) }

    context 'with root group' do
      let(:group) { root }

      it { expect(hierarchy.root).to eq root }
    end

    context 'with child group' do
      let(:group) { root.children.first.children.first }

      it { expect(hierarchy.root).to eq root }
    end

    context 'with group outside of hierarchy' do
      let(:group) { create(:namespace) }

      it { expect(hierarchy.root).not_to eq root }
    end
  end

  describe '.new' do
    let(:hierarchy) { described_class.new(group) }

    context 'with root group' do
      let(:group) { root }

      it { expect(hierarchy.root).to eq root }
    end

    context 'with child group' do
      let(:group) { root.children.first }

      it { expect { hierarchy }.to raise_error(StandardError, 'Must specify a root node') }
    end
  end

  shared_examples 'locked update query' do
    it 'locks query with FOR UPDATE' do
      qr = ActiveRecord::QueryRecorder.new do
        subject
      end
      expect(qr.count).to eq 1
      expect(qr.log.first).to match /FOR UPDATE/
    end
  end

  describe '#incorrect_traversal_ids' do
    let!(:hierarchy) { described_class.new(root) }

    subject { hierarchy.incorrect_traversal_ids }

    before do
      Namespace.update_all(traversal_ids: [])
    end

    it { is_expected.to match_array Namespace.all }

    context 'when lock is true' do
      subject { hierarchy.incorrect_traversal_ids(lock: true).load }

      it_behaves_like 'locked update query'
    end
  end

  describe '#sync_traversal_ids!' do
    let!(:hierarchy) { described_class.new(root) }

    subject { hierarchy.sync_traversal_ids! }

    it { expect(hierarchy.incorrect_traversal_ids).to be_empty }

    it_behaves_like 'hierarchy with traversal_ids'
    it_behaves_like 'locked update query'

    context 'when deadlocked' do
      before do
        connection_double = double(:connection)

        allow(Namespace).to receive(:connection).and_return(connection_double)
        allow(connection_double).to receive(:exec_query) { raise ActiveRecord::Deadlocked }
      end

      it { expect { subject }.to raise_error(ActiveRecord::Deadlocked) }

      it 'increment db_deadlock counter' do
        expect { subject rescue nil }.to change { db_deadlock_total('Namespace#sync_traversal_ids!') }.by(1)
      end
    end
  end

  def db_deadlock_total(source)
    Gitlab::Metrics
      .counter(:db_deadlock, 'Counts the times we have deadlocked in the database')
      .get(source: source)
  end
end
