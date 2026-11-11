python /opt/open-manager/keep.py

case " ${COMFYUI_ARGS} " in
    *" --enable-manager "* | *" --enable-manager-legacy-ui "*) ;;
    *) COMFYUI_ARGS="${COMFYUI_ARGS} --enable-manager" ;;
esac

export __COMFY_CLI_SESSION__=/tmp/open-manager-session
