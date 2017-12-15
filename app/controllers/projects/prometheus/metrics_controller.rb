module Projects
  module Prometheus
    class MetricsController < Projects::ApplicationController
      before_action :authorize_read_project!
      before_action :require_prometheus_metrics!

      def active
        respond_to do |format|
          format.json do
            matched_metrics = project.prometheus_service.matched_metrics || {}

            if matched_metrics.any?
              render json: matched_metrics
            else
              head :no_content
            end
          end
        end
      end

      def validate_query
        respond_to do |format|
          format.json do
            if query_validation_params[:query] =~ /^avg/
              render json: { query_valid: true }
            else
              render json: { query_valid: false }
            end
          end
        end
      end

      def new
        @metric = project.prometheus_metrics.new
      end

      def index
        respond_to do |format|
          format.json do
            metrics = project.prometheus_metrics
            if metrics.any?
              render json: { metrics: PrometheusMetricSerializer.new(project: project).represent(metrics) }
            else
              head :no_content
            end
          end
        end
      end

      def create
        @metric = project.prometheus_metrics.create(metrics_params)
        if @metric.persisted?
          redirect_to edit_project_service_path(project, project.prometheus_service),
                      notice: 'Metric was successfully added.'
        else
          head :unprocessable_entity
        end
      end

      def update
        @metric = project.prometheus_metrics.find(params[:id])
        @metric.update(metrics_params)

        if @metric.persisted?
          redirect_to edit_project_service_path(project, project.prometheus_service),
                      notice: 'Metric was successfully updated.'
        else
          render "edit"
        end
      end

      def edit
        @metric = project.prometheus_metrics.find(params[:id])
      end

      private

      def query_validation_params
        params.permit(:query)
      end

      def metrics_params
        params.require(:prometheus_metric).permit(:title, :query, :y_label, :unit, :legend)
      end

      def require_prometheus_metrics!
        render_404 unless project.prometheus_service.present?
      end
    end
  end
end
