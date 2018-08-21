# Use an official Python runtime as a parent image
FROM python:3.7.0-alpine

# Set the working directory
WORKDIR /opt/fuzzy

# Install base packages
RUN apk --update add bash git the_silver_searcher

# Install fzf
RUN git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf
RUN /opt/fzf/install
ENV PATH "/opt/fzf/bin:$PATH"

# Install any needed packages specified in requirements.txt
COPY requirements.txt /opt/fuzzy
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80

# Copy demo document set
COPY bbc/docs1 /opt/fuzzy/docs

# create temp dir
COPY temp /opt/fuzzy/temp

# Copy application code
COPY server.py /opt/fuzzy
COPY static /opt/fuzzy/static
COPY templates /opt/fuzzy/templates

# Run when the container launches
CMD ["python", "-u", "server.py", "--demo=docs", "--path=/data", "--ip=0.0.0.0", "--port=80"]
