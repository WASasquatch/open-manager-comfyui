ARG BASE_IMAGE=vastai/comfy:v0.44.0-cuda-12.9-py312

FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.source="https://github.com/WASasquatch/open-manager-comfyui"
LABEL org.opencontainers.image.description="Vast.ai's ComfyUI image with Open Manager in place of ComfyUI-Manager"
LABEL org.opencontainers.image.documentation="https://github.com/WASasquatch/open-manager-comfyui/blob/main/VASTAI.md"

ENV OPEN_MANAGER_ENABLE_DESKTOP=1 \
    OPEN_MANAGER_ENABLE_FILES=1 \
    OPEN_MANAGER_FILE_WRITES=1 \
    OPEN_MANAGER_REPO_DOWNLOADS=1 \
    PIP_CONSTRAINT=/opt/open-manager/constraints.txt \
    UV_CONSTRAINT=/opt/open-manager/constraints.txt

COPY open-manager/ /opt/open-manager/
COPY comfy.settings.json /opt/workspace-internal/ComfyUI/user/default/comfy.settings.json

RUN set -euo pipefail && \
    . /venv/main/bin/activate && \
    uv pip install comfyui-open-manager psutil nvidia-ml-py && \
    python /opt/open-manager/keep.py && \
    rm -rf /opt/workspace-internal/ComfyUI/custom_nodes/ComfyUI-Manager && \
    sed -i '/^COMFYUI_ARGS=\${COMFYUI_ARGS:-/a . /opt/open-manager/launch.sh' /opt/supervisor-scripts/comfyui.sh && \
    grep -qx '\. /opt/open-manager/launch\.sh' /opt/supervisor-scripts/comfyui.sh && \
    mkdir -p /tmp/om-test && \
    cd /opt/workspace-internal/ComfyUI && \
    python main.py --cpu --disable-auto-launch --quick-test-for-ci --enable-manager \
        --user-directory /tmp/om-test 2>&1 | tee /tmp/om-test/quick-test.log && \
    grep -q "enabled in place of ComfyUI-Manager" /tmp/om-test/quick-test.log && \
    ! grep -q "must be installed first" /tmp/om-test/quick-test.log && \
    rm -rf /tmp/om-test

RUN env-hash > /.env_hash
