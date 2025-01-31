# frozen_string_literal: true

module Gitlab
  module GithubImport
    # ObjectImporter defines the base behaviour for every Sidekiq worker that
    # imports a single resource such as a note or pull request.
    module ObjectImporter
      extend ActiveSupport::Concern

      included do
        include ApplicationWorker

        sidekiq_options retry: 3
        include GithubImport::Queue
        include ReschedulingMethods
        include Gitlab::NotifyUponDeath

        feature_category :importers
        worker_has_external_dependencies!

        def logger
          @logger ||= Gitlab::Import::Logger.build
        end
      end

      # project - An instance of `Project` to import the data into.
      # client - An instance of `Gitlab::GithubImport::Client`
      # hash - A Hash containing the details of the object to import.
      def import(project, client, hash)
        info(project.id, message: 'starting importer')

        object = representation_class.from_json_hash(hash)
        importer_class.new(object, project, client).execute

        counter.increment
        info(project.id, message: 'importer finished')
      rescue StandardError => e
        error(project.id, e)
      end

      def counter
        @counter ||= Gitlab::Metrics.counter(counter_name, counter_description)
      end

      # Returns the representation class to use for the object. This class must
      # define the class method `from_json_hash`.
      def representation_class
        raise NotImplementedError
      end

      # Returns the class to use for importing the object.
      def importer_class
        raise NotImplementedError
      end

      # Returns the name (as a Symbol) of the Prometheus counter.
      def counter_name
        raise NotImplementedError
      end

      # Returns the description (as a String) of the Prometheus counter.
      def counter_description
        raise NotImplementedError
      end

      private

      def info(project_id, extra = {})
        logger.info(log_attributes(project_id, extra))
      end

      def error(project_id, exception)
        logger.error(
          log_attributes(
            project_id,
            message: 'importer failed',
            'error.message': exception.message
          )
        )

        Gitlab::ErrorTracking.track_and_raise_exception(
          exception,
          log_attributes(project_id)
        )
      end

      def log_attributes(project_id, extra = {})
        extra.merge(
          import_source: :github,
          project_id: project_id,
          importer: importer_class.name
        )
      end
    end
  end
end
